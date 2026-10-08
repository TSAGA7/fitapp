import { z } from 'zod';
import { entityBase, Macros, NutritionTargets } from './common';
import { Availability, FoodBasis, FoodCategory, FoodDataSourceKind, FoodUnit, Preference } from './enums';

const key = z.string().regex(/^[a-z0-9_]+$/, 'lowercase letters, digits and underscores only');

export const Per100 = Macros;
export type Per100 = z.infer<typeof Per100>;

export const FoodDataSource = z.object({
  kind: FoodDataSourceKind,
  note: z.string().max(300).nullable(),
});

/**
 * Food content. `basis` says what the weight refers to:
 *  - raw: uncooked ingredient (raw chicken, dry rice)
 *  - cooked: ready-to-eat weight (boiled rice)
 *  - as_sold: packaged product as printed on the label
 * Cooked and raw variants of the same food share `variantGroup`; the cooked
 * entry carries `yieldFactor` = cooked weight / raw weight.
 */
const foodFields = {
  key,
  name: z.string().min(1).max(160),
  brand: z.string().max(120).nullable(),
  barcode: z.string().regex(/^\d{8,14}$/).nullable(),
  category: FoodCategory,
  basis: FoodBasis,
  unit: FoodUnit,
  gramsPerPiece: z.number().positive().nullable(),
  per100: Per100,
  variantGroup: key.nullable(),
  yieldFactor: z.number().positive().nullable(),
  dataSource: FoodDataSource,
  /** false = the meal planner never picks it by itself (sweets, drinks, ready meals, branded items); it can still be added by hand. */
  autoPlan: z.boolean().default(true),
};

function foodRules(
  f: { basis: string; unit: string; yieldFactor: number | null; variantGroup: string | null; gramsPerPiece: number | null },
  ctx: z.RefinementCtx,
): void {
  if (f.yieldFactor !== null && (f.basis !== 'cooked' || f.variantGroup === null)) {
    ctx.addIssue({ code: 'custom', path: ['yieldFactor'], message: 'yieldFactor is only for cooked foods with a variantGroup' });
  }
  if (f.unit === 'piece' && f.gramsPerPiece === null) {
    ctx.addIssue({ code: 'custom', path: ['gramsPerPiece'], message: 'gramsPerPiece is required when unit is piece' });
  }
}

export const FoodDefinition = z.object(foodFields).superRefine(foodRules);
export type FoodDefinition = z.infer<typeof FoodDefinition>;

export const Food = z
  .object({
    ...entityBase,
    ...foodFields,
    origin: z.enum(['seed', 'custom']),
  })
  .superRefine(foodRules);
export type Food = z.infer<typeof Food>;

/** "My foods": the link between the user and a food, with preferences. */
export const UserFood = z.object({
  ...entityBase,
  foodId: z.string().min(1),
  preference: Preference,
  availability: Availability,
  maxPerDayG: z.number().positive().nullable(),
  excluded: z.boolean(),
});
export type UserFood = z.infer<typeof UserFood>;

export const NutritionTargetsRecord = z.object({
  ...entityBase,
  validFrom: z.string(),
  validTo: z.string().nullable(),
  targets: NutritionTargets,
  versionId: z.string().nullable(),
});
export type NutritionTargetsRecord = z.infer<typeof NutritionTargetsRecord>;
