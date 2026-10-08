import type { Clock, IdGenerator } from '@fitapp/domain';
import { META_KEYS } from './constants';
import type { AppDatabase } from './schema';

export async function getMeta<T>(db: AppDatabase, key: string): Promise<T | undefined> {
  return (await db.appMeta.get(key))?.value as T | undefined;
}
export async function setMeta(db: AppDatabase, key: string, value: unknown): Promise<void> {
  await db.appMeta.put({ key, value });
}

/** Creates the device id and install date once; records the schema version of the data. */
export async function ensureMeta(db: AppDatabase, clock: Clock, ids: IdGenerator, schemaVersion: number): Promise<{ deviceId: string }> {
  let deviceId = await getMeta<string>(db, META_KEYS.deviceId);
  if (!deviceId) {
    deviceId = ids.newId();
    await setMeta(db, META_KEYS.deviceId, deviceId);
    await setMeta(db, META_KEYS.installedAt, clock.now());
  }
  await setMeta(db, META_KEYS.schemaVersion, schemaVersion);
  return { deviceId };
}

export interface ImportLogEntry {
  at: string;
  kind: 'backup' | 'excel';
  summary: Record<string, number>;
}

export async function appendImportLog(db: AppDatabase, entry: ImportLogEntry): Promise<void> {
  const log = (await getMeta<ImportLogEntry[]>(db, META_KEYS.importLog)) ?? [];
  await setMeta(db, META_KEYS.importLog, [...log, entry].slice(-50));
}
