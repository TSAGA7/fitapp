import { validateSeedCatalog, type SeedCatalog } from '@fitapp/domain';
import equipment from '../data/equipment.json';
import exercises from '../data/exercises.json';
import foods from '../data/foods.json';
import meta from '../data/meta.json';

const raw = { catalogVersion: meta.catalogVersion, equipment, exercises, foods };

/** The bundled catalog, validated at load time. Throws if the data is inconsistent. */
export function loadSeedCatalog(): SeedCatalog {
  const report = validateSeedCatalog(raw);
  if (!report.ok) {
    throw new Error(`Seed catalog is invalid:\n${report.errors.map((e) => `- ${e.message}`).join('\n')}`);
  }
  return raw as SeedCatalog;
}
export const rawSeedCatalog = raw;
