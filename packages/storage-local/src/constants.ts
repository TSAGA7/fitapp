export const DB_NAME = 'fitapp';
/** Singleton ids by convention (the schema allows any id). */
export const PROFILE_ID = 'me';
export const PROGRAM_ID = 'main';
export const META_KEYS = {
  deviceId: 'deviceId',
  installedAt: 'installedAt',
  schemaVersion: 'schemaVersion',
  seedCatalogVersion: 'seedCatalogVersion',
  lastBackupAt: 'lastBackupAt',
  importLog: 'importLog',
  autoBackupCurrent: 'autoBackupCurrent',
  autoBackupPrevious: 'autoBackupPrevious',
} as const;
