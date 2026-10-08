import { describe, expect, it } from 'vitest';
import { validateSeedCatalog, type SeedCatalog } from './seedCatalog';

const exercise = (over: Record<string, unknown> = {}) => ({
  key: 'leg_press',
  name: 'Жим ногами',
  movementPattern: 'squat',
  primaryMuscles: ['quads'],
  secondaryMuscles: [],
  isCompound: true,
  jointStress: { knee: 2 },
  axialLoad: 0,
  stabilityRequirement: 0,
  rangeOfMotion: 'medium',
  painSensitiveAreas: [],
  equipmentRequirements: [['leg_press']],
  skillLevel: 1,
  progressionType: 'double',
  loadUnit: 'kg_total',
  defaultSets: 3,
  defaultRepRange: { min: 10, max: 12 },
  defaultRestSec: 150,
  cues: [],
  curatedSubstituteKeys: ['goblet_squat'],
  variants: [],
  ...over,
});
const catalog = (over: Partial<Record<keyof SeedCatalog, unknown>> = {}) => ({
  catalogVersion: 1,
  equipment: [
    { key: 'leg_press', name: 'Жим ногами', category: 'machines', loadType: 'plates', defaultStepKg: 5 },
    { key: 'dumbbells', name: 'Гантели', category: 'free_weights', loadType: 'dumbbell', defaultStepKg: 1 },
  ],
  exercises: [
    exercise(),
    exercise({ key: 'goblet_squat', name: 'Гоблет', equipmentRequirements: [['dumbbells']], curatedSubstituteKeys: ['leg_press'] }),
  ],
  foods: [],
  ...over,
});

describe('validateSeedCatalog', () => {
  it('accepts a consistent catalog', () => {
    const r = validateSeedCatalog(catalog());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('reports schema errors', () => {
    expect(validateSeedCatalog({ catalogVersion: 1 }).ok).toBe(false);
    expect(validateSeedCatalog(catalog({ exercises: [exercise({ skillLevel: 9 })] })).ok).toBe(false);
  });

  it('rejects unknown equipment and unknown or self substitutes', () => {
    const r1 = validateSeedCatalog(catalog({ exercises: [exercise({ equipmentRequirements: [['jetpack']], curatedSubstituteKeys: [] })] }));
    expect(r1.errors.map((e) => e.code)).toContain('unknown_equipment');
    const r2 = validateSeedCatalog(catalog({ exercises: [exercise({ curatedSubstituteKeys: ['ghost'] })] }));
    expect(r2.errors.map((e) => e.code)).toContain('unknown_substitute');
    const r3 = validateSeedCatalog(catalog({ exercises: [exercise({ curatedSubstituteKeys: ['leg_press'] })] }));
    expect(r3.errors.map((e) => e.code)).toContain('self_substitute');
  });

  it('rejects duplicate keys', () => {
    const r = validateSeedCatalog(catalog({ exercises: [exercise(), exercise({ curatedSubstituteKeys: [] })] }));
    expect(r.errors.map((e) => e.code)).toContain('duplicate_key');
  });

  it('rejects a substitute that shares neither muscles nor movement pattern', () => {
    const r = validateSeedCatalog(
      catalog({
        exercises: [
          exercise(),
          exercise({ key: 'goblet_squat', primaryMuscles: ['biceps'], movementPattern: 'elbow_flexion', equipmentRequirements: [['dumbbells']], curatedSubstituteKeys: [] }),
        ].map((e, i) => (i === 0 ? e : e)),
      }),
    );
    expect(r.errors.map((e) => e.code)).toContain('bad_substitute');
  });

  it('warns about missing substitutes and heavy axial load without back stress', () => {
    const r = validateSeedCatalog(catalog({ exercises: [exercise({ curatedSubstituteKeys: [], axialLoad: 2 })] }));
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['no_substitute', 'axial_without_back_stress']));
  });

  it('requires time-based exercises to use seconds', () => {
    const r = validateSeedCatalog(catalog({ exercises: [exercise({ progressionType: 'time', curatedSubstituteKeys: [] })] }));
    expect(r.errors.map((e) => e.code)).toContain('time_unit');
  });

  const food = (over: Record<string, unknown>) => ({
    key: 'rice_dry', name: 'Рис', brand: null, barcode: null, category: 'grains', basis: 'raw', unit: 'g',
    gramsPerPiece: null, per100: { kcal: 350, proteinG: 7, fatG: 1, carbG: 78, fiberG: 1 },
    variantGroup: 'rice', yieldFactor: null, dataSource: { kind: 'estimate', note: null }, ...over,
  });

  it('checks food variants and macro consistency', () => {
    const cooked = food({ key: 'rice_cooked', basis: 'cooked', yieldFactor: 2.8 });
    expect(validateSeedCatalog(catalog({ foods: [food({}), cooked] })).ok).toBe(true);
    const orphan = validateSeedCatalog(catalog({ foods: [cooked] }));
    expect(orphan.errors.map((e) => e.code)).toContain('no_raw_sibling');
    const mismatch = validateSeedCatalog(catalog({ foods: [food({ per100: { kcal: 100, proteinG: 7, fatG: 1, carbG: 78, fiberG: 1 } })] }));
    expect(mismatch.warnings.map((w) => w.code)).toContain('macro_mismatch');
    const over = validateSeedCatalog(catalog({ foods: [food({ per100: { kcal: 900, proteinG: 60, fatG: 40, carbG: 40, fiberG: 1 } })] }));
    expect(over.errors.map((e) => e.code)).toContain('macros_over_100g');
  });
});
