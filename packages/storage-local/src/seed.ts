import { createBase, type Clock, type Equipment, type Exercise, type Food, type SeedCatalog } from '@fitapp/domain';
import { META_KEYS } from './constants';
import { getMeta, setMeta } from './meta';
import type { AppDatabase } from './schema';

export interface SeedResult {
  installed: boolean;
  catalogVersion: number;
  equipment: number;
  exercises: number;
  foods: number;
  /** Seed items that collided with a user's custom item of the same id: left untouched. */
  skipped: number;
}

/**
 * Writes the bundled catalog into the database (ids are the catalog keys). Idempotent: it does
 * nothing if this catalog version is already installed, and it never touches the user's own items.
 */
export async function installSeedCatalog(db: AppDatabase, clock: Clock, deviceId: string, catalog: SeedCatalog): Promise<SeedResult> {
  const installed = (await getMeta<number>(db, META_KEYS.seedCatalogVersion)) ?? 0;
  const result: SeedResult = { installed: false, catalogVersion: catalog.catalogVersion, equipment: 0, exercises: 0, foods: 0, skipped: 0 };
  if (installed >= catalog.catalogVersion) return result;
  const now = clock.now();
  await db.transaction('rw', [db.equipment, db.exercises, db.foods, db.appMeta], async () => {
    const put = async <T extends { id: string; origin: 'seed' | 'custom' }>(table: { get(id: string): Promise<unknown>; put(x: T): Promise<unknown> }, row: T): Promise<boolean> => {
      const existing = (await table.get(row.id)) as { origin?: string } | undefined;
      if (existing && existing.origin === 'custom') return false;
      await table.put(row);
      return true;
    };
    for (const d of catalog.equipment) {
      const row: Equipment = { ...createBase(d.key, now, deviceId), ...d, origin: 'seed' };
      if (await put(db.equipment as never, row)) result.equipment++;
      else result.skipped++;
    }
    for (const d of catalog.exercises) {
      const row: Exercise = { ...createBase(d.key, now, deviceId), ...d, origin: 'seed' };
      if (await put(db.exercises as never, row)) result.exercises++;
      else result.skipped++;
    }
    for (const d of catalog.foods) {
      const row: Food = { ...createBase(d.key, now, deviceId), ...d, origin: 'seed' };
      if (await put(db.foods as never, row)) result.foods++;
      else result.skipped++;
    }
    await setMeta(db, META_KEYS.seedCatalogVersion, catalog.catalogVersion);
  });
  result.installed = true;
  return result;
}
