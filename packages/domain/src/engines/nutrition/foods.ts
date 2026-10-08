import type { Food, FoodBasis, Macros, NutritionSnapshot } from '../../model';

type Per100Like = Macros;

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** Nutrition of an amount of food given in grams, from its per-100 values. */
export function macrosForAmount(per100: Per100Like, grams: number): Macros {
  const k = grams / 100;
  return { kcal: Math.round(per100.kcal * k), proteinG: r1(per100.proteinG * k), fatG: r1(per100.fatG * k), carbG: r1(per100.carbG * k), fiberG: r1(per100.fiberG * k) };
}

export const ZERO_MACROS: Macros = { kcal: 0, proteinG: 0, fatG: 0, carbG: 0, fiberG: 0 };

export function sumMacros(list: readonly Macros[]): Macros {
  const t = list.reduce(
    (a, m) => ({ kcal: a.kcal + m.kcal, proteinG: a.proteinG + m.proteinG, fatG: a.fatG + m.fatG, carbG: a.carbG + m.carbG, fiberG: a.fiberG + m.fiberG }),
    ZERO_MACROS,
  );
  return { kcal: Math.round(t.kcal), proteinG: r1(t.proteinG), fatG: r1(t.fatG), carbG: r1(t.carbG), fiberG: r1(t.fiberG) };
}

export function subtractMacros(a: Macros, b: Macros): Macros {
  return { kcal: a.kcal - b.kcal, proteinG: r1(a.proteinG - b.proteinG), fatG: r1(a.fatG - b.fatG), carbG: r1(a.carbG - b.carbG), fiberG: r1(a.fiberG - b.fiberG) };
}

/**
 * The other variant of a food (raw <-> cooked) when it exists in the same variant group, with the weight conversion
 * between them: cooked weight = raw weight x yieldFactor.
 */
export function counterpart(food: Food, all: readonly Food[]): { food: Food; toOtherGrams: (grams: number) => number } | undefined {
  if (!food.variantGroup) return undefined;
  const other = all.find((f) => f.id !== food.id && f.variantGroup === food.variantGroup && f.deletedAt === null);
  if (!other) return undefined;
  const cooked = food.basis === 'cooked' ? food : other.basis === 'cooked' ? other : undefined;
  if (!cooked?.yieldFactor) return undefined;
  const y = cooked.yieldFactor;
  return { food: other, toOtherGrams: (g) => (food === cooked ? g / y : g * y) };
}

/** Everything a diary entry's calculation was based on, stored with the entry. */
export function buildSnapshot(food: Food, enteredBasis: FoodBasis = food.basis, yieldFactorUsed: number | null = null): NutritionSnapshot {
  return {
    foodId: food.id,
    foodName: food.name,
    basis: food.basis,
    per100: { ...food.per100 },
    gramsPerPiece: food.gramsPerPiece,
    yieldFactorUsed,
    enteredBasis,
    dataSource: { ...food.dataSource },
  };
}

export const BASIS_LABEL: Record<FoodBasis, string> = { raw: 'сырой', cooked: 'готовый', as_sold: 'как на упаковке' };
