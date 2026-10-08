import { z } from 'zod';
import { ENTITY_SCHEMAS, IsoDateTime, SCHEMA_VERSION, STORE_NAMES, type StoreName } from '../model';

export const BACKUP_FORMAT = 'fitapp-backup' as const;
export const BACKUP_FORMAT_VERSION = 1;

/** Seed catalog rows come from the app bundle, not from the user: they are not exported. */
export const CATALOG_STORES: readonly StoreName[] = ['equipment', 'exercises', 'foods'];
/** Program versions are immutable snapshots: an import never overwrites one. */
export const IMMUTABLE_STORES: readonly StoreName[] = ['programVersions'];
/** Stores that hold exactly one live record. */
export const SINGLETON_STORES: readonly StoreName[] = ['profile', 'programs'];

export const BackupEnvelope = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.number().int().min(1),
  schemaVersion: z.number().int().min(1),
  createdAt: IsoDateTime,
  deviceId: z.string().min(1),
  stores: z.record(z.string(), z.array(z.unknown())),
});

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  createdAt: string;
  deviceId: string;
  stores: Record<string, unknown[]>;
}

export function buildBackup(args: {
  createdAt: string;
  deviceId: string;
  stores: Partial<Record<StoreName, readonly unknown[]>>;
}): BackupFile {
  const stores: Record<string, unknown[]> = {};
  for (const name of STORE_NAMES) stores[name] = [...(args.stores[name] ?? [])];
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    createdAt: args.createdAt,
    deviceId: args.deviceId,
    stores,
  };
}

export interface BackupIssue {
  store: string;
  index: number;
  id: string | null;
  messages: string[];
}

export interface BackupValidation {
  /** False when the file cannot be imported at all (wrong format, newer schema). */
  ok: boolean;
  errors: string[];
  meta: { formatVersion: number; schemaVersion: number; createdAt: string; deviceId: string } | null;
  /** Records that passed validation (Zod output), by store. */
  records: Record<StoreName, Array<Record<string, unknown>>>;
  counts: Record<StoreName, { total: number; valid: number; invalid: number }>;
  /** Records that did not pass: shown separately, never imported. */
  invalid: BackupIssue[];
  unknownStores: Array<{ store: string; count: number }>;
}

const emptyRecords = (): Record<StoreName, Array<Record<string, unknown>>> =>
  Object.fromEntries(STORE_NAMES.map((n) => [n, []])) as unknown as Record<StoreName, Array<Record<string, unknown>>>;
const emptyCounts = (): Record<StoreName, { total: number; valid: number; invalid: number }> =>
  Object.fromEntries(STORE_NAMES.map((n) => [n, { total: 0, valid: 0, invalid: 0 }])) as unknown as Record<
    StoreName,
    { total: number; valid: number; invalid: number }
  >;

export function parseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (e) {
    return { ok: false, error: `Файл не является корректным JSON: ${(e as Error).message}` };
  }
}

/** Validates a backup file without touching any database. */
export function validateBackup(raw: unknown): BackupValidation {
  const base: BackupValidation = {
    ok: false,
    errors: [],
    meta: null,
    records: emptyRecords(),
    counts: emptyCounts(),
    invalid: [],
    unknownStores: [],
  };
  const env = BackupEnvelope.safeParse(raw);
  if (!env.success) {
    const notFitapp = typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== BACKUP_FORMAT;
    base.errors.push(notFitapp ? 'Это не файл резервной копии Fitapp.' : `Повреждён заголовок резервной копии: ${env.error.issues[0]?.message ?? ''}`);
    return base;
  }
  const f = env.data;
  base.meta = { formatVersion: f.formatVersion, schemaVersion: f.schemaVersion, createdAt: f.createdAt, deviceId: f.deviceId };
  if (f.formatVersion > BACKUP_FORMAT_VERSION) {
    base.errors.push(`Формат копии (v${f.formatVersion}) новее, чем понимает это приложение (v${BACKUP_FORMAT_VERSION}). Обнови приложение.`);
  }
  if (f.schemaVersion > SCHEMA_VERSION) {
    base.errors.push(`Схема данных копии (v${f.schemaVersion}) новее, чем у приложения (v${SCHEMA_VERSION}). Обнови приложение.`);
  }
  if (base.errors.length > 0) return base;

  for (const [store, rows] of Object.entries(f.stores)) {
    if (!(store in ENTITY_SCHEMAS)) {
      base.unknownStores.push({ store, count: rows.length });
      continue;
    }
    const name = store as StoreName;
    const schema = ENTITY_SCHEMAS[name];
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      base.counts[name].total++;
      const parsed = schema.safeParse(row);
      const id = typeof row === 'object' && row !== null && typeof (row as { id?: unknown }).id === 'string' ? (row as { id: string }).id : null;
      if (!parsed.success) {
        base.counts[name].invalid++;
        base.invalid.push({
          store,
          index,
          id,
          messages: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(запись)'}: ${i.message}`),
        });
        return;
      }
      const record = parsed.data as Record<string, unknown>;
      if (seen.has(record.id as string)) {
        base.counts[name].invalid++;
        base.invalid.push({ store, index, id, messages: [`id: повтор внутри файла («${record.id as string}»)`] });
        return;
      }
      seen.add(record.id as string);
      base.counts[name].valid++;
      base.records[name].push(record);
    });
  }
  base.ok = true;
  return base;
}
