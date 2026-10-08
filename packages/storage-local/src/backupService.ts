import {
  CATALOG_STORES,
  REFERENCE_RULES,
  SINGLETON_STORES,
  STORE_NAMES,
  buildBackup,
  emptyExistingRows,
  findDanglingReferences,
  parseJson,
  planBackupImport,
  validateBackup,
  type BackupImportPlan,
  type BackupImportPreview,
  type BackupImportResult,
  type BackupService,
  type Clock,
  type ConflictPolicy,
  type Confirmation,
  type ExistingRows,
  type StoreName,
} from '@fitapp/domain';
import { META_KEYS } from './constants';
import { ConfirmationRequiredError, InvalidBackupError, StalePreviewError } from './errors';
import { appendImportLog, setMeta } from './meta';
import type { AppDatabase } from './schema';
import { computeStateToken } from './state';

type Rows = Record<StoreName, Array<Record<string, unknown>>>;

async function loadExisting(db: AppDatabase, valid: Rows): Promise<ExistingRows> {
  const existing = emptyExistingRows();
  for (const store of STORE_NAMES) {
    const table = db.table(store);
    const ids = (valid[store] ?? []).map((r) => r.id as string);
    if (ids.length > 0) {
      for (const row of await table.bulkGet(ids)) if (row) existing[store].set(row.id as string, row as Record<string, unknown>);
    }
    if (SINGLETON_STORES.includes(store)) {
      for (const row of await table.toArray()) existing[store].set(row.id as string, row as Record<string, unknown>);
    }
  }
  return existing;
}

const emptyPlanRows = (): Rows => Object.fromEntries(STORE_NAMES.map((n) => [n, []])) as unknown as Rows;

export class LocalBackupService implements BackupService {
  constructor(
    private readonly db: AppDatabase,
    private readonly clock: Clock,
    private readonly deviceId: string,
  ) {}

  /** Everything the user owns (including deletion markers). The bundled catalog is not exported. */
  async exportJson(): Promise<string> {
    const stores: Partial<Record<StoreName, unknown[]>> = {};
    for (const name of STORE_NAMES) {
      let rows = (await this.db.table(name).toArray()) as Array<Record<string, unknown>>;
      if (CATALOG_STORES.includes(name)) rows = rows.filter((r) => r.origin !== 'seed');
      stores[name] = rows;
    }
    const createdAt = this.clock.now();
    const file = buildBackup({ createdAt, deviceId: this.deviceId, stores });
    await setMeta(this.db, META_KEYS.lastBackupAt, createdAt);
    return JSON.stringify(file);
  }

  /** Reads and checks the file and compares it with the database. Writes nothing. */
  async previewImport(json: string, policy: ConflictPolicy = 'keep_existing'): Promise<BackupImportPreview> {
    const stateToken = await computeStateToken(this.db);
    const parsed = parseJson(json);
    const validation = validateBackup(parsed.ok ? parsed.value : undefined);
    if (!parsed.ok) validation.errors = [parsed.error];
    if (!validation.ok) {
      const plan = planBackupImport(emptyPlanRows(), emptyExistingRows(), policy);
      return { validation, plan, dangling: [], conflicts: [], stateToken };
    }
    const existing = await loadExisting(this.db, validation.records);
    const plan = planBackupImport(validation.records, existing, policy);

    const incoming = emptyPlanRows();
    for (const s of STORE_NAMES) incoming[s] = [...plan.toInsert[s], ...plan.toUpdate[s]];
    const existingIds = Object.fromEntries(STORE_NAMES.map((s) => [s, new Set<string>()])) as unknown as Record<StoreName, Set<string>>;
    for (const target of new Set(REFERENCE_RULES.map((r) => r.target))) {
      existingIds[target] = new Set((await this.db.table(target).toCollection().primaryKeys()) as string[]);
    }
    const dangling = findDanglingReferences(incoming, existingIds);
    return { validation, plan, dangling, conflicts: plan.conflicts, stateToken };
  }

  async applyImport(preview: BackupImportPreview, confirmation: Confirmation): Promise<BackupImportResult> {
    if (!confirmation || confirmation.confirmed !== true) throw new ConfirmationRequiredError();
    if (!preview.validation.ok) throw new InvalidBackupError(preview.validation.errors.join('; '));
    const plan: BackupImportPlan = preview.plan;
    const now = this.clock.now();
    let inserted = 0;
    let updated = 0;
    await this.db.transaction('rw', this.db.tables, async () => {
      if ((await computeStateToken(this.db)) !== preview.stateToken) throw new StalePreviewError();
      for (const r of plan.replaceSingletons) {
        const table = this.db.table(r.store);
        const row = await table.get(r.existingId);
        if (row) await table.put({ ...row, updatedAt: now, deletedAt: now });
      }
      for (const store of STORE_NAMES) {
        const table = this.db.table(store);
        if (plan.toInsert[store].length > 0) {
          await table.bulkAdd(plan.toInsert[store]); // add: fails instead of overwriting
          inserted += plan.toInsert[store].length;
        }
        if (plan.toUpdate[store].length > 0) {
          await table.bulkPut(plan.toUpdate[store]);
          updated += plan.toUpdate[store].length;
        }
      }
      await appendImportLog(this.db, { at: now, kind: 'backup', summary: { inserted, updated } });
    });
    return {
      inserted,
      updated,
      skippedIdentical: Object.values(plan.identical).reduce((a, b) => a + b, 0),
      keptExisting: plan.conflicts.filter((c) => c.resolution === 'keep_existing').length,
    };
  }
}
