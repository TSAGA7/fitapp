import { z } from 'zod';
import { EquipmentDefinition, ExerciseDefinition, FoodDefinition } from '../model';
import type { ValidationIssue } from '../model';

export const SeedCatalog = z.object({
  catalogVersion: z.number().int().min(1),
  equipment: z.array(EquipmentDefinition),
  exercises: z.array(ExerciseDefinition),
  foods: z.array(FoodDefinition),
});
export type SeedCatalog = z.infer<typeof SeedCatalog>;

export interface CatalogIssue extends ValidationIssue {
  severity: 'error' | 'warning';
}
export interface CatalogReport {
  ok: boolean;
  errors: CatalogIssue[];
  warnings: CatalogIssue[];
}

const err = (code: string, message: string, path: string): CatalogIssue => ({ severity: 'error', code, message, path });
const warn = (code: string, message: string, path: string): CatalogIssue => ({ severity: 'warning', code, message, path });

function duplicates(keys: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const k of keys) (seen.has(k) ? dup : seen).add(k);
  return [...dup];
}

/**
 * Structural check (Zod) plus referential integrity and quality rules.
 * Errors block the catalog; warnings are for the author to review.
 */
export function validateSeedCatalog(input: unknown): CatalogReport {
  const parsed = SeedCatalog.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => err('schema', i.message, i.path.join('.'))),
      warnings: [],
    };
  }
  const cat = parsed.data;
  const errors: CatalogIssue[] = [];
  const warnings: CatalogIssue[] = [];

  for (const k of duplicates(cat.equipment.map((e) => e.key))) errors.push(err('duplicate_key', `Duplicate equipment key: ${k}`, 'equipment'));
  for (const k of duplicates(cat.exercises.map((e) => e.key))) errors.push(err('duplicate_key', `Duplicate exercise key: ${k}`, 'exercises'));
  for (const k of duplicates(cat.foods.map((e) => e.key))) errors.push(err('duplicate_key', `Duplicate food key: ${k}`, 'foods'));

  const equipmentKeys = new Set(cat.equipment.map((e) => e.key));
  const exerciseByKey = new Map(cat.exercises.map((e) => [e.key, e]));

  cat.exercises.forEach((ex, i) => {
    const at = `exercises.${i}(${ex.key})`;
    for (const group of ex.equipmentRequirements) {
      for (const eq of group) {
        if (!equipmentKeys.has(eq)) errors.push(err('unknown_equipment', `${ex.key}: unknown equipment "${eq}"`, at));
      }
    }
    for (const sub of ex.curatedSubstituteKeys) {
      const target = exerciseByKey.get(sub);
      if (!target) {
        errors.push(err('unknown_substitute', `${ex.key}: unknown substitute "${sub}"`, at));
      } else if (sub === ex.key) {
        errors.push(err('self_substitute', `${ex.key}: an exercise cannot replace itself`, at));
      } else {
        const sharesMuscle = target.primaryMuscles.some((m) => ex.primaryMuscles.includes(m));
        if (!sharesMuscle && target.movementPattern !== ex.movementPattern) {
          errors.push(err('bad_substitute', `${ex.key}: substitute "${sub}" shares neither a primary muscle nor the movement pattern`, at));
        }
      }
    }
    if (duplicates(ex.variants.map((v) => v.key)).length > 0) errors.push(err('duplicate_variant', `${ex.key}: duplicate variant keys`, at));
    if (ex.curatedSubstituteKeys.length === 0) warnings.push(warn('no_substitute', `${ex.key}: no curated substitute`, at));
    if (ex.axialLoad >= 2 && (ex.jointStress.lower_back ?? 0) === 0) {
      warnings.push(warn('axial_without_back_stress', `${ex.key}: axialLoad ${ex.axialLoad} but no lower_back stress tagged`, at));
    }
    if (ex.progressionType === 'time' && ex.loadUnit !== 'seconds') {
      errors.push(err('time_unit', `${ex.key}: time progression requires loadUnit "seconds"`, at));
    }
  });

  const rawByGroup = new Set(cat.foods.filter((f) => f.basis !== 'cooked' && f.variantGroup).map((f) => f.variantGroup));
  cat.foods.forEach((f, i) => {
    const at = `foods.${i}(${f.key})`;
    if (f.yieldFactor !== null && f.variantGroup && !rawByGroup.has(f.variantGroup)) {
      errors.push(err('no_raw_sibling', `${f.key}: cooked food has a yieldFactor but no raw/as_sold sibling in group "${f.variantGroup}"`, at));
    }
    const p = f.per100;
    const calc = 4 * p.proteinG + 9 * p.fatG + 4 * p.carbG;
    if (p.kcal > 0 && Math.abs(calc - p.kcal) / p.kcal > 0.2) {
      warnings.push(warn('macro_mismatch', `${f.key}: kcal ${p.kcal} differs from macros (${Math.round(calc)}) by more than 20%`, at));
    }
    if (p.proteinG + p.fatG + p.carbG > 100.5) errors.push(err('macros_over_100g', `${f.key}: macros exceed 100 g per 100 g`, at));
  });

  return { ok: errors.length === 0, errors, warnings };
}
