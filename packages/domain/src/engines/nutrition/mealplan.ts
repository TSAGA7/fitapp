import type { Availability, FoodCategory, Macros, MealSlot, NutritionTargets, Preference } from '../../model';
import { macrosForAmount, subtractMacros, sumMacros, ZERO_MACROS } from './foods';

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

export const SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
export const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' };
const SLOT_SHARE: Record<MealSlot, number> = { breakfast: 0.26, lunch: 0.34, dinner: 0.28, snack: 0.12 };

export interface PlanLine {
  slot: MealSlot;
  foodId: string;
  grams: number;
  macros: Macros;
  locked?: boolean;
}

interface Role {
  name: string;
  categories: FoodCategory[];
  min: number;
  max: number;
  start: number;
  /** A fixed-size garnish is not fitted to the targets. */
  fixed?: boolean;
}

const BREAKFAST: Role[] = [
  { name: 'carb', categories: ['grains', 'bread_bakery'], min: 40, max: 160, start: 70 },
  { name: 'protein', categories: ['eggs', 'dairy'], min: 60, max: 300, start: 150 },
  { name: 'fruit', categories: ['fruits'], min: 80, max: 200, start: 120, fixed: true },
];
const MAIN: Role[] = [
  { name: 'protein', categories: ['poultry', 'fish', 'meat', 'eggs', 'legumes'], min: 80, max: 300, start: 150 },
  { name: 'carb', categories: ['grains'], min: 50, max: 300, start: 150 },
  { name: 'veg', categories: ['vegetables'], min: 120, max: 250, start: 180, fixed: true },
  { name: 'fat', categories: ['fats_oils'], min: 0, max: 15, start: 8 },
];
const SNACK: Role[] = [
  { name: 'protein', categories: ['dairy', 'supplements', 'eggs'], min: 60, max: 250, start: 150 },
  { name: 'nuts', categories: ['nuts_seeds', 'fruits'], min: 15, max: 50, start: 25 },
];
const ROLES: Record<MealSlot, Role[]> = { breakfast: BREAKFAST, lunch: MAIN, dinner: MAIN, snack: SNACK };

const PREF_RANK: Record<Preference, number> = { love: 0, like: 1, ok: 2, avoid: 3 };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const step = (f: PlanFood): number => (f.unit === 'piece' && f.gramsPerPiece ? f.gramsPerPiece : 5);

function snapGrams(f: PlanFood, grams: number, min: number, max: number): number {
  const s = step(f);
  const lo = Math.max(s, Math.ceil(min / s) * s);
  const hi = Math.max(lo, Math.floor(max / s) * s);
  return Math.min(hi, Math.max(lo, Math.round(grams / s) * s));
}

/** Candidate foods for a role: allowed by the user's preferences, best preference first, rotated by the seed. */
export function candidatesFor(foods: readonly PlanFood[], role: Pick<Role, 'categories'>, rotation: string, avoidIds: ReadonlySet<string> = new Set()): PlanFood[] {
  const ok = foods.filter((f) => role.categories.includes(f.category) && f.autoPlan !== false && !f.excluded && f.preference !== 'avoid' && f.availability !== 'rare' && !avoidIds.has(f.id));
  const sorted = [...ok].sort((a, b) => PREF_RANK[a.preference] - PREF_RANK[b.preference] || a.name.localeCompare(b.name, 'ru'));
  if (sorted.length <= 1) return sorted;
  const offset = hash(rotation) % sorted.length;
  return [...sorted.slice(offset), ...sorted.slice(0, offset)];
}

interface Variable {
  food: PlanFood;
  role: Role;
  grams: number;
}

const WEIGHTS = { kcal: 1, proteinG: 2, fatG: 1, carbG: 1 } as const;

function error(total: Macros, target: Macros): number {
  let e = 0;
  for (const k of ['kcal', 'proteinG', 'fatG', 'carbG'] as const) {
    const t = Math.max(target[k], 1);
    const d = (total[k] - target[k]) / t;
    e += WEIGHTS[k] * d * d;
  }
  return e;
}

/** Coordinate descent over the amounts: moves one item by one step while the error to the target shrinks. Deterministic. */
function fit(vars: Variable[], target: Macros, base: Macros = ZERO_MACROS): void {
  const total = (): Macros => sumMacros([base, ...vars.map((v) => macrosForAmount(v.food.per100, v.grams))]);
  let best = error(total(), target);
  for (let iter = 0; iter < 400; iter++) {
    let improved = false;
    for (const v of vars) {
      if (v.role.fixed) continue;
      const s = step(v.food);
      for (const dir of [1, -1]) {
        const next = v.grams + dir * s;
        if (next < v.role.min || next > v.role.max || next <= 0) continue;
        const cap = v.food.maxPerDayG;
        if (cap !== null && next > cap) continue;
        const prev = v.grams;
        v.grams = next;
        const e = error(total(), target);
        if (e + 1e-9 < best) {
          best = e;
          improved = true;
        } else v.grams = prev;
      }
    }
    if (!improved) break;
  }
}

export interface SlotInput {
  slot: MealSlot;
  /** Targets for this meal. */
  target: Macros;
  foods: readonly PlanFood[];
  /** Different values give different (but deterministic) food choices. */
  rotation: string;
  avoidFoodIds?: ReadonlySet<string>;
}

/** One attempt: picks a food for each role (rotated by `rotation`), then fits the amounts to the meal targets. */
function attempt(input: SlotInput, rotation: string): { vars: Variable[]; err: number } {
  const vars: Variable[] = [];
  const used = new Set<string>(input.avoidFoodIds ?? []);
  for (const role of ROLES[input.slot]) {
    const list = candidatesFor(input.foods, role, `${rotation}|${input.slot}|${role.name}`, used);
    const food = list[0];
    if (!food) continue;
    used.add(food.id);
    vars.push({ food, role, grams: snapGrams(food, role.start, role.min, role.max) });
  }
  fit(vars, input.target);
  return { vars, err: error(sumMacros(vars.map((v) => macrosForAmount(v.food.per100, v.grams))), input.target) };
}

/** Number of food combinations tried per meal; the one that fits the meal targets best wins. */
const ATTEMPTS = 8;

/** One meal: tries several food combinations (deterministically, from the seed) and keeps the closest to the targets. */
export function generateMeal(input: SlotInput): PlanLine[] {
  let best = attempt(input, input.rotation);
  for (let i = 1; i < ATTEMPTS && best.err > 0.004; i++) {
    const next = attempt(input, `${input.rotation}#${i}`);
    if (next.err + 1e-9 < best.err) best = next;
  }
  return best.vars
    .filter((v) => v.grams > 0)
    .map((v) => ({ slot: input.slot, foodId: v.food.id, grams: v.grams, macros: macrosForAmount(v.food.per100, v.grams) }));
}

export interface DayPlanInput {
  targets: NutritionTargets;
  foods: readonly PlanFood[];
  /** A string such as the date plus a "variation" counter; the same value always gives the same plan. */
  seed: string;
  /** Lines the user fixed ("locked"): kept as they are; the other meals are fitted to what remains. */
  locked?: readonly PlanLine[];
  /** Lines that stay and count towards the day but do NOT fix their meal: the rest of that meal is still built (e.g. one item of a breakfast was eaten). */
  keepLines?: readonly PlanLine[];
  /** Meals to (re)generate; the default is all. */
  slots?: readonly MealSlot[];
  /** Foods that must not appear (e.g. the ones the user just rejected). */
  avoidFoodIds?: ReadonlySet<string>;
}

export interface DayPlan {
  lines: PlanLine[];
  totals: Macros;
  /** Relative deviation from the targets (0.03 = 3%). */
  deviation: { kcal: number; proteinG: number; fatG: number; carbG: number };
}

const dev = (a: number, b: number): number => (b > 0 ? Math.round(((a - b) / b) * 1000) / 1000 : 0);

/**
 * Day-level correction: the meals are fitted one by one, so the day can end a few percent off the targets.
 * Moves the amounts of the generated lines (never the kept/locked ones) by one step while the error to the DAY target shrinks.
 * Amounts stay within 50-170% of what the meal fit chose, so the meals keep their character.
 */
function refineDay(lines: PlanLine[], kept: readonly PlanLine[], foods: readonly PlanFood[], dayTarget: Macros): void {
  const keptSet = new Set<PlanLine>(kept);
  const free = lines.filter((l) => !keptSet.has(l));
  const byId = new Map(foods.map((f) => [f.id, f]));
  const start = new Map(free.map((l) => [l, l.grams]));
  const total = (): Macros => sumMacros(lines.map((l) => l.macros));
  let best = error(total(), dayTarget);
  for (let iter = 0; iter < 300; iter++) {
    let improved = false;
    for (const l of free) {
      const f = byId.get(l.foodId);
      if (!f) continue;
      const s = step(f);
      const g0 = start.get(l) as number;
      for (const dir of [1, -1]) {
        const next = l.grams + dir * s;
        if (next <= 0 || next < g0 * 0.5 || next > g0 * 1.7) continue;
        if (f.maxPerDayG !== null && next > f.maxPerDayG) continue;
        const prev = { grams: l.grams, macros: l.macros };
        l.grams = next;
        l.macros = macrosForAmount(f.per100, next);
        const e = error(total(), dayTarget);
        if (e + 1e-9 < best) {
          best = e;
          improved = true;
        } else {
          l.grams = prev.grams;
          l.macros = prev.macros;
        }
      }
    }
    if (!improved) {
      // pair moves: more of one product, less of another (trades e.g. fat for carbs at equal calories)
      for (const a of free) {
        for (const b of free) {
          if (a === b) continue;
          const fa = byId.get(a.foodId);
          const fb = byId.get(b.foodId);
          if (!fa || !fb) continue;
          const na = a.grams + step(fa);
          const nb = b.grams - step(fb);
          const ga = start.get(a) as number;
          const gb = start.get(b) as number;
          if (nb <= 0 || na > ga * 1.7 || nb < gb * 0.5) continue;
          if (fa.maxPerDayG !== null && na > fa.maxPerDayG) continue;
          const prevA = { grams: a.grams, macros: a.macros };
          const prevB = { grams: b.grams, macros: b.macros };
          a.grams = na; a.macros = macrosForAmount(fa.per100, na);
          b.grams = nb; b.macros = macrosForAmount(fb.per100, nb);
          const e = error(total(), dayTarget);
          if (e + 1e-9 < best) {
            best = e;
            improved = true;
          } else {
            a.grams = prevA.grams; a.macros = prevA.macros;
            b.grams = prevB.grams; b.macros = prevB.macros;
          }
        }
      }
    }
    if (!improved) break;
  }
}

export function generateDayPlan(input: DayPlanInput): DayPlan {
  const locked = input.locked ?? [];
  const slots = input.slots ?? SLOTS;
  const lockedTotal = sumMacros(locked.map((l) => l.macros));
  const fixed = locked.filter((l) => !slots.includes(l.slot) || l.locked);
  const keep = [...fixed, ...(input.keepLines ?? [])];
  const toBuild = slots.filter((s) => !fixed.some((l) => l.slot === s && l.locked));
  const dayTarget: Macros = { kcal: input.targets.kcal, proteinG: input.targets.proteinG, fatG: input.targets.fatG, carbG: input.targets.carbG, fiberG: input.targets.fiberG };
  const keptTotal = sumMacros(keep.map((l) => l.macros));
  const remaining = subtractMacros(dayTarget, keptTotal);
  const shareSum = toBuild.reduce((a, s) => a + SLOT_SHARE[s], 0) || 1;
  const lines: PlanLine[] = [...keep];
  void lockedTotal;
  for (const slot of toBuild) {
    const k = SLOT_SHARE[slot] / shareSum;
    const target: Macros = {
      kcal: Math.max(0, remaining.kcal * k),
      proteinG: Math.max(0, remaining.proteinG * k),
      fatG: Math.max(0, remaining.fatG * k),
      carbG: Math.max(0, remaining.carbG * k),
      fiberG: Math.max(0, remaining.fiberG * k),
    };
    const meal = generateMeal({ slot, target, foods: input.foods, rotation: input.seed, avoidFoodIds: input.avoidFoodIds });
    lines.push(...meal);
  }
  refineDay(lines, keep, input.foods, dayTarget);
  lines.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  const totals = sumMacros(lines.map((l) => l.macros));
  return {
    lines,
    totals,
    deviation: { kcal: dev(totals.kcal, dayTarget.kcal), proteinG: dev(totals.proteinG, dayTarget.proteinG), fatG: dev(totals.fatG, dayTarget.fatG), carbG: dev(totals.carbG, dayTarget.carbG) },
  };
}

/**
 * "Replace this product": another food of the same kind with the amount that keeps the energy of the original
 * (for protein sources: the protein). Returns nothing when there is no sensible alternative.
 */
export function replaceFood(line: PlanLine, foods: readonly PlanFood[], seed: string): PlanLine | undefined {
  const current = foods.find((f) => f.id === line.foodId);
  if (!current) return undefined;
  const pool = foods.filter((f) => f.id !== current.id && f.category === current.category && !f.excluded && f.preference !== 'avoid');
  const options = pool.length > 0 ? pool : foods.filter((f) => f.id !== current.id && !f.excluded && f.preference !== 'avoid' && f.category !== 'sweets');
  if (options.length === 0) return undefined;
  const sorted = [...options].sort((a, b) => PREF_RANK[a.preference] - PREF_RANK[b.preference] || a.name.localeCompare(b.name, 'ru'));
  const pick = sorted[hash(`${seed}|${line.foodId}`) % sorted.length] as PlanFood;
  const proteinSource = current.per100.proteinG >= 15;
  const ratio = proteinSource && pick.per100.proteinG > 0 ? (line.macros.proteinG * 100) / pick.per100.proteinG : pick.per100.kcal > 0 ? (line.macros.kcal * 100) / pick.per100.kcal : line.grams;
  const s = step(pick);
  const grams = Math.max(s, Math.round(ratio / s) * s);
  return { slot: line.slot, foodId: pick.id, grams, macros: macrosForAmount(pick.per100, grams) };
}

/** What is left of the day's targets after what has been eaten (never below zero). */
export function remainingMacros(targets: NutritionTargets, eaten: Macros): Macros {
  const clamp = (n: number) => Math.max(0, Math.round(n * 10) / 10);
  return { kcal: Math.max(0, Math.round(targets.kcal - eaten.kcal)), proteinG: clamp(targets.proteinG - eaten.proteinG), fatG: clamp(targets.fatG - eaten.fatG), carbG: clamp(targets.carbG - eaten.carbG), fiberG: clamp(targets.fiberG - eaten.fiberG) };
}
