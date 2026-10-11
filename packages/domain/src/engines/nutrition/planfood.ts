import type { Availability, FoodCategory, Macros, Preference } from '../../model';

export interface PlanFood {
  id: string;
  name: string;
  category: FoodCategory;
  basis: 'raw' | 'cooked' | 'as_sold';
  per100: Macros;
  unit: 'g' | 'ml' | 'piece';
  gramsPerPiece: number | null;
  preference: Preference;
  availability: Availability;
  excluded: boolean;
  maxPerDayG: number | null;
  /** false: never picked by the generator on its own. */
  autoPlan?: boolean;
}

export const PREF_RANK: Record<Preference, number> = { love: 0, like: 1, ok: 2, avoid: 3 };

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Amount step of a food: whole pieces for foods counted in pieces (eggs), otherwise 5 g. */
export const step = (f: Pick<PlanFood, 'unit' | 'gramsPerPiece'>): number => (f.unit === 'piece' && f.gramsPerPiece ? f.gramsPerPiece : 5);

export function snapGrams(f: Pick<PlanFood, 'unit' | 'gramsPerPiece'>, grams: number, min: number, max: number): number {
  const s = step(f);
  const lo = Math.max(s, Math.ceil(min / s) * s);
  const hi = Math.max(lo, Math.floor(max / s) * s);
  return Math.min(hi, Math.max(lo, Math.round(grams / s) * s));
}

/**
 * How usual a product is on an ordinary Russian table: 0 = everyday, 1 = fine now and then, 2 = rare.
 * The generator never picks rare products (strawberries, broccoli, kiwi...) on its own; a product the user marked "love" counts as everyday.
 */
export function commonness(f: Pick<PlanFood, 'category' | 'name' | 'preference'>): number {
  if (f.preference === 'love') return 0;
  const n = f.name.toLowerCase();
  const rx = (re: RegExp): boolean => re.test(n);
  switch (f.category) {
    case 'fruits':
      return rx(/банан|яблок/) ? 0 : rx(/груш|апельсин|мандарин/) ? 1 : 2;
    case 'vegetables':
      return rx(/огурец|огурц|помидор|томат|картоф/) ? 0 : rx(/капуст|морков|перец|кабач/) && !rx(/цветн|брюссел|пекин/) ? 1 : 2;
    case 'grains':
      return rx(/гречк|рис|макарон|овсян/) ? 0 : 1;
    case 'poultry':
    case 'meat':
    case 'fish':
    case 'seafood':
      return rx(/курин|индейк|говядин|свинин|минтай|треск|горбуш|фарш/) ? 0 : 1;
    case 'nuts_seeds':
      return rx(/арахис|грецк|миндал/) ? 0 : 1;
    case 'dairy':
      return rx(/творог|кефир|йогурт/) ? 0 : 1;
    case 'eggs':
      return rx(/белк/) ? 1 : 0;
    default:
      return 0;
  }
}

/** Shown amount: eggs and other foods counted in pieces are shown in pieces ("3 шт"), the rest in grams. */
export function amountLabel(f: Pick<PlanFood, 'unit' | 'gramsPerPiece'> | undefined, grams: number): string {
  if (f && f.unit === 'piece' && f.gramsPerPiece) {
    const n = Math.round((grams / f.gramsPerPiece) * 2) / 2;
    if (Math.abs(n * f.gramsPerPiece - grams) < 1) return `${String(n).replace('.', ',')} шт`;
  }
  return `${Math.round(grams)} г`;
}
