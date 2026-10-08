import {
  SCHEMA_VERSION,
  STORE_NAMES,
  type ChangeFeed,
  type ChangeRef,
  type Clock,
  type IdGenerator,
  type Repositories,
  type SeedCatalog,
  type UnitOfWork,
  type BackupService,
  type ExcelImportService,
} from '@fitapp/domain';
import { createSystemClock } from './clock';
import { LocalBackupService } from './backupService';
import { openAppDatabase, type OpenOptions } from './database';
import { LocalExcelImportService } from './excel/excelService';
import { createUuidV7Generator } from './ids';
import { ensureMeta } from './meta';
import { requestPersistentStorage, type PersistenceStatus, type StorageManagerLike } from './persist';
import { createRepositories } from './repositories';
import type { AppDatabase } from './schema';
import { installSeedCatalog, type SeedResult } from './seed';

export interface LocalStorage {
  db: AppDatabase;
  clock: Clock;
  ids: IdGenerator;
  deviceId: string;
  repos: Repositories;
  uow: UnitOfWork;
  changeFeed: ChangeFeed;
  backup: BackupService;
  excelImport: ExcelImportService & LocalExcelImportService;
  installSeed(catalog: SeedCatalog): Promise<SeedResult>;
  requestPersistence(manager?: StorageManagerLike): Promise<PersistenceStatus>;
  close(): void;
}

export interface CreateStorageOptions extends OpenOptions {
  clock?: Clock;
  ids?: IdGenerator;
}

/** Opens the database and wires every adapter: repositories, transactions, change feed, backup, Excel import. */
export async function createLocalStorage(options: CreateStorageOptions = {}): Promise<LocalStorage> {
  const clock = options.clock ?? createSystemClock();
  const ids = options.ids ?? createUuidV7Generator();
  const db = await openAppDatabase(options);
  const { deviceId } = await ensureMeta(db, clock, ids, SCHEMA_VERSION);
  const repos = createRepositories(db, () => clock.now());

  const uow: UnitOfWork = {
    // One Dexie transaction over every table: if the work throws, nothing is written.
    // The scope function must be a native async function: Dexie only keeps the transaction alive across
    // `await` of nested async helpers when it recognises the scope function as async.
    run: (work) => db.transaction('rw', db.tables, async () => await work(repos)),
  };

  const changeFeed: ChangeFeed = {
    async changedSince(since) {
      const out: ChangeRef[] = [];
      for (const store of STORE_NAMES) {
        const table = db.table(store);
        const rows = since === null ? await table.toArray() : await table.where('updatedAt').above(since).toArray();
        for (const r of rows as Array<{ id: string; updatedAt: string; deletedAt: string | null }>) {
          out.push({ store, id: r.id, updatedAt: r.updatedAt, deleted: r.deletedAt !== null });
        }
      }
      return out.sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0));
    },
  };

  return {
    db,
    clock,
    ids,
    deviceId,
    repos,
    uow,
    changeFeed,
    backup: new LocalBackupService(db, clock, deviceId),
    excelImport: new LocalExcelImportService(db, clock, ids, deviceId) as ExcelImportService & LocalExcelImportService,
    installSeed: (catalog) => installSeedCatalog(db, clock, deviceId, catalog),
    requestPersistence: (manager) => requestPersistentStorage(manager),
    close: () => db.close(),
  };
}
