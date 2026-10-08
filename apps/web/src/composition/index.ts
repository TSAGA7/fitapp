/**
 * Composition root: the only place in the UI that knows the storage adapters.
 * It builds the dependencies of the application layer and hands the UI services that are typed
 * by the domain ports (the UI never sees Dexie).
 */
import type { AppDeps } from '@fitapp/application';
import type { BackupService, ExcelImportService, ExerciseDecision } from '@fitapp/domain';
import { loadSeedCatalog } from '@fitapp/seed';
import { PROFILE_ID, createLocalStorage, type CreateStorageOptions, type PersistenceStatus } from '@fitapp/storage-local';

export { PROFILE_ID };

export interface AppRuntime {
  deps: AppDeps;
  backup: BackupService;
  excelImport: ExcelImportService;
  persistence: PersistenceStatus;
  catalog: { exercises: number; equipment: number; foods: number };
}

export type { ExerciseDecision };

let runtime: Promise<AppRuntime> | undefined;

/** Opens the local database once per page load. */
export function getAppRuntime(): Promise<AppRuntime> {
  runtime ??= openAppRuntime();
  return runtime;
}

/** Opens a runtime on a specific storage (tests pass an in-memory IndexedDB). */
export async function openAppRuntime(options: CreateStorageOptions = {}): Promise<AppRuntime> {
  const storage = await createLocalStorage(options);
  const catalog = loadSeedCatalog();
  await storage.installSeed(catalog);
  // Ask the browser to keep the data. The answer is not guaranteed, so backups still matter.
  const persistence = await storage.requestPersistence();
  const deps: AppDeps = {
    clock: storage.clock,
    ids: storage.ids,
    deviceId: storage.deviceId,
    uow: storage.uow,
    identity: { currentUser: async () => ({ id: 'local', kind: 'local' }) },
    changeFeed: storage.changeFeed,
    proposalSources: [],
  };
  return {
    deps,
    backup: storage.backup,
    excelImport: storage.excelImport,
    persistence,
    catalog: { exercises: catalog.exercises.length, equipment: catalog.equipment.length, foods: catalog.foods.length },
  };
}
