import Dexie, { type DexieOptions } from 'dexie';
import { DB_NAME, META_KEYS } from './constants';
import { StorageTooNewError } from './errors';
import { AppDatabase, LATEST_VERSION, MIGRATIONS, type Migration } from './schema';

export interface OpenOptions {
  name?: string;
  /** Inject an IndexedDB implementation (tests). */
  indexedDB?: IDBFactory;
  IDBKeyRange?: typeof IDBKeyRange;
  /** Override the migration list (tests). */
  migrations?: readonly Migration[];
}

/** Creates the database with every migration registered and opens it. */
export async function openAppDatabase(options: OpenOptions = {}): Promise<AppDatabase> {
  const migrations = options.migrations ?? MIGRATIONS;
  const latest = (migrations[migrations.length - 1] as Migration).version;
  // Pass only what was given: an explicit `undefined` would override Dexie's own browser defaults.
  const dexieOptions: DexieOptions = {};
  if (options.indexedDB) dexieOptions.indexedDB = options.indexedDB;
  if (options.IDBKeyRange) dexieOptions.IDBKeyRange = options.IDBKeyRange;
  const db = new AppDatabase(options.name ?? DB_NAME, dexieOptions);
  for (const m of migrations) {
    const v = db.version(m.version).stores(m.stores);
    if (m.upgrade) v.upgrade(m.upgrade);
  }
  try {
    await db.open();
  } catch (e) {
    if (e instanceof Dexie.DexieError && (e.name === 'VersionError' || e.inner?.name === 'VersionError')) {
      throw new StorageTooNewError(null, latest);
    }
    throw e;
  }
  // A database written by a newer app may open anyway: refuse to work on it.
  const stored = await db.appMeta.get(META_KEYS.schemaVersion);
  if (typeof stored?.value === 'number' && stored.value > latest) {
    db.close();
    throw new StorageTooNewError(stored.value, latest);
  }
  return db;
}

export { LATEST_VERSION };
