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
  /** Holiday mode: picks foods by id instead of by category (and ignores the autoPlan flag). */
  match?: (f: PlanFood) => boolean;
  min: number;
  max: number;
  start: number;
  /** A fixed-size garnish is not fitted to the targets. */
  fixed?: boolean;
}

/**
 * Meals are built like dishes of a meal-plan service: one protein, ONE garnish, a salad vegetable.
 * No standalone oil, spinach or a second garnish; the garnish stays the same for lunch and dinner of a day.
 */
const NOT_SALAD = /картоф|батат|шпинат|лук|свёкл|свекл|эдамаме/i;
const isGarnish = (f: PlanFood): boolean => f.autoPlan !== false && ((f.category === 'grains' && !/овсян|мюсли/i.test(f.name)) || (f.category === 'vegetables' && /картоф|батат/i.test(f.name)));
const isSaladVeg = (f: PlanFood): boolean => f.autoPlan !== false && f.category === 'vegetables' && !NOT_SALAD.test(f.name);
const isMainProtein = (f: PlanFood): boolean => f.autoPlan !== false && (f.category === 'poultry' || f.category === 'fish' || f.category === 'meat' || f.category === 'seafood') && !/печен/i.test(f.name);
const isBreakfastCarb = (f: PlanFood): boolean => f.autoPlan !== false && ((f.category === 'grains' && /овсян|мюсли/i.test(f.name)) || (f.category === 'bread_bakery' && /ржан|цельнозерн|бородин|чёрн|черн/i.test(f.name)));
const isBreakfastProtein = (f: PlanFood): boolean => f.autoPlan !== false && (f.category === 'eggs' || (f.category === 'dairy' && /творог|йогурт/i.test(f.name)));

const BREAKFAST: Role[] = [
  { name: 'carb', categories: [], match: isBreakfastCarb, min: 30, max: 160, start: 70 },
  { name: 'protein', categories: [], match: isBreakfastProtein, min: 60, max: 300, start: 150 },
  { name: 'fruit', categories: ['fruits'], min: 80, max: 200, start: 120, fixed: true },
  { name: 'topping', categories: ['nuts_seeds'], min: 10, max: 40, start: 15 },
];
const MAIN: Role[] = [
  { name: 'protein', categories: [], match: isMainProtein, min: 80, max: 300, start: 150 },
  { name: 'garnish', categories: [], match: isGarnish, min: 30, max: 300, start: 150 },
  { name: 'veg', categories: [], match: isSaladVeg, min: 120, max: 250, start: 150, fixed: true },
];
const SNACK: Role[] = [
  { name: 'protein', categories: ['dairy', 'supplements', 'eggs'], min: 60, max: 250, start: 150 },
  { name: 'nuts', categories: ['nuts_seeds', 'fruits'], min: 15, max: 50, start: 25 },
];
const ROLES: Record<MealSlot, Role[]> = { breakfast: BREAKFAST, lunch: MAIN, dinner: MAIN, snack: SNACK };

/** "Отпуск": holiday food. Foods are recognised by their catalog keys, so the user's own foods never end up here by accident. */
export const VACATION_MEALS = /^(pizza_|[a-z]+_pizza_|vit_(hamburger|cheeseburger|double_cheese|big_hit|big_tasty|chicken_burger|fish)$|bk_(whopper|double_whopper|cheeseburger|long_chicken|chicken_king)$|rostics_(boxmaster|twister|burger)$|roll_|maki_|nigiri_|sushi_rolls$|gunkan$|philadelphia_roll$|california_roll$|baked_roll$|tempura_roll$|spicy_roll$|unagi_roll$|chicken_roll$|inari$|dodo_dodster_|cheburek$|samsa_meat$|teremok_blin_(ham|chicken|meat|salmon)$)/;
const VACATION_SIDES = /^(potato_fries$|nuggets_chicken$|vit_(fries|nuggets|strips|wings)$|bk_(fries|nuggets|onion_rings|wings)$|rostics_(fries|nuggets|potato_country|leg|wings|strips)$|dodo_(wings|cheese_sticks)$|gyoza$|shrimp_tempura$|salad_(olivier|crab|mimosa|herring_fur_coat|caesar_chicken|caesar_shrimp|crispy_eggplant|greek)$)/;
const VACATION_BAKERY = /^(pie_|bun_|croissant|vatrushka_|vit_apple_pie$|teremok_blin_(jam|condensed)$)/;
const VACATION_ALCOHOL = /^(beer_(lager|dark|wheat|ipa)$|wine_|champagne_|prosecco_)/;
const VACATION_COFFEE = /^(latte$|cappuccino$|americano$|raf$|flat_white$|latte_macchiato$)/;
const VACATION_WINE = /^(wine_|champagne_|prosecco_)/;
const VACATION_SWEETS = /^(dodo_(brownie|cheesecake)$)/;
const byId = (re: RegExp) => (f: PlanFood): boolean => re.test(f.id);
const VAC_BREAKFAST: Role[] = [
  { name: 'bake', categories: [], match: byId(VACATION_BAKERY), min: 60, max: 240, start: 120 },
  { name: 'drink', categories: [], match: byId(new RegExp(`${VACATION_COFFEE.source}|${VACATION_WINE.source}`)), min: 100, max: 300, start: 200, fixed: true },
];
const VAC_MAIN: Role[] = [
  { name: 'main', categories: [], match: byId(VACATION_MEALS), min: 100, max: 450, start: 250 },
  { name: 'side', categories: [], match: byId(VACATION_SIDES), min: 50, max: 250, start: 120 },
  { name: 'alcohol', categories: [], match: byId(VACATION_ALCOHOL), min: 100, max: 330, start: 150, fixed: true },
];
const VAC_DINNER: Role[] = [
  { name: 'main', categories: [], match: byId(VACATION_MEALS), min: 100, max: 450, start: 250 },
  { name: 'side', categories: [], match: byId(VACATION_SIDES), min: 50, max: 250, start: 120 },
  { name: 'alcohol', categories: [], match: byId(VACATION_ALCOHOL), min: 150, max: 330, start: 200, fixed: true },
];
const VAC_SNACK: Role[] = [
  { name: 'sweet', categories: [], match: byId(new RegExp(`${VACATION_SWEETS.source}|${VACATION_BAKERY.source}`)), min: 40, max: 200, start: 90 },
  { name: 'alcohol', categories: [], match: byId(VACATION_WINE), min: 100, max: 200, start: 100, fixed: true },
];
const VACATION_ROLES: Record<MealSlot, Role[]> = { breakfast: VAC_BREAKFAST, lunch: VAC_MAIN, dinner: VAC_DINNER, snack: VAC_SNACK };

export type DietMode = 'normal' | 'vacation';

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

/**
 * How usual a product is on an ordinary Russian table: 0 = everyday, 1 = fine now and then, 2 = rare.
 * The generator only takes products of the best tier that is available, so strawberries, broccoli or hazelnuts never turn up
 * on their own; a product the user marked "love" counts as everyday.
 */
export function commonness(f: Pick<PlanFood, 'category' | 'name' | 'preference'>): number {
  if (f.preference === 'love') return 0;
  const n = f.name.toLowerCase();
  const rx = (re: RegExp): boolean => re.test(n);
  switch (f.category) {
    case 'fruits':
      return rx(/банан|яблок/) ? 0 : rx(/груш|апельсин|мандарин/) ? 1 : 2;
    case 'vegetables':
      return rx(/огурец|огурц|помидор|томат|картоф/) ? 0 : rx(/капуст|морков|перец|кабач/) ? 1 : 2;
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

/** Keeps only the products of the best (most everyday) tier present. */
function bestTier<T extends Pick<PlanFood, 'category' | 'name' | 'preference'>>(list: readonly T[]): T[] {
  if (list.length === 0) return [];
  const best = Math.min(...list.map(commonness));
  return list.filter((f) => commonness(f) === best);
}

/** Candidate foods for a role: allowed by the user's preferences, best preference first, rotated by the seed. */
export function candidatesFor(foods: readonly PlanFood[], role: Pick<Role, 'categories' | 'match'>, rotation: string, avoidIds: ReadonlySet<string> = new Set()): PlanFood[] {
  const inRole = (f: PlanFood): boolean => (role.match ? role.match(f) : role.categories.includes(f.category) && f.autoPlan !== false);
  const ok = foods.filter((f) => inRole(f) && !f.excluded && f.preference !== 'avoid' && f.availability !== 'rare' && !avoidIds.has(f.id));
  const sorted = bestTier(ok).sort((a, b) => PREF_RANK[a.preference] - PREF_RANK[b.preference] || a.name.localeCompare(b.name, 'ru'));
  if (sorted.length <= 1) return sorted;
  const offset = hash(rotation) % sorted.length;
  return [...sorted.slice(offset), ...sorted.slice(0, offset)];
}

interface Variable {
  food: PlanFood;
  role: Role;
  grams: number;
  lo: number;
  hi: number;
}

/** Amount limits of a role for one food: a ready porridge is a big bowl (a few hundred grams), bread or muesli a few dozen. */
function boundsFor(role: Role, food: PlanFood): { min: number; max: number; start: number } {
  if (role.name === 'carb' && /каша/i.test(food.name)) return { min: 120, max: 400, start: 250 };
  return { min: role.min, max: role.max, start: role.start };
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
        if (next < v.lo || next > v.hi || next <= 0) continue;
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
  mode?: DietMode;
  /** Food ids already present in this meal (eaten, skipped or kept): the roles they fill are not built again. */
  covered?: readonly string[];
  /** The garnish of the day: used for the garnish role of this meal. */
  garnishId?: string;
  /** Proteins already used by other meals of the day: not repeated. */
  avoidProteinIds?: ReadonlySet<string>;
}

const roleHas = (role: Pick<Role, 'categories' | 'match'>, f: PlanFood): boolean => (role.match ? role.match(f) : role.categories.includes(f.category));

/** One attempt: picks a food for each role (rotated by `rotation`), then fits the amounts to the meal targets. */
function attempt(input: SlotInput, rotation: string): { vars: Variable[]; err: number } {
  const vars: Variable[] = [];
  const used = new Set<string>(input.avoidFoodIds ?? []);
  const coveredFoods = (input.covered ?? []).map((id) => input.foods.find((f) => f.id === id)).filter((f): f is PlanFood => f !== undefined);
  for (const role of (input.mode === 'vacation' ? VACATION_ROLES : ROLES)[input.slot]) {
    if (coveredFoods.some((f) => roleHas(role, f))) continue;
    const forced = role.name === 'garnish' && input.garnishId ? input.foods.find((f) => f.id === input.garnishId && !f.excluded && isGarnish(f)) : undefined;
    const avoid = role.name === 'protein' && input.avoidProteinIds ? new Set([...used, ...input.avoidProteinIds]) : used;
    const list = forced ? [forced] : candidatesFor(input.foods, role, `${rotation}|${input.slot}|${role.name}`, avoid);
    const food = list[0];
    if (!food) continue;
    used.add(food.id);
    const b = boundsFor(role, food);
    vars.push({ food, role, grams: snapGrams(food, b.start, b.min, b.max), lo: b.min, hi: b.max });
  }
  fit(vars, input.target);
  return { vars, err: error(sumMacros(vars.map((v) => macrosForAmount(v.food.per100, v.grams))), input.target) };
}

/** Number of food combinations tried per meal; the one that fits the meal targets best wins. */
const ATTEMPTS = 40;

/** One meal: tries several food combinations (deterministically, from the seed) and keeps the closest to the targets. */
export function generateMeal(input: SlotInput): PlanLine[] {
  let best = attempt(input, input.rotation);
  const tried = [best];
  const vacation = input.mode === 'vacation';
  for (let i = 1; i < ATTEMPTS && (vacation || best.err > 0.004); i++) {
    const next = attempt(input, `${input.rotation}#${i}`);
    tried.push(next);
    if (next.err + 1e-9 < best.err) best = next;
  }
  if (vacation) {
    // Holiday food: any combination that fits about as well is fine, so "redo" gives something new instead of the single closest one.
    const near = tried.filter((t) => t.err <= best.err * 1.6 + 0.004);
    best = near[hash(`${input.rotation}|pick`) % near.length] as typeof best;
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
  /** Food ids that already stand in a meal (eaten or skipped ones included): the matching roles of that meal are not built again. */
  coveredBySlot?: Partial<Record<MealSlot, readonly string[]>>;
  /** 'vacation': the day is built from holiday food (pizza, rolls, burgers, beer, wine...). */
  mode?: DietMode;
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

function buildDay(input: DayPlanInput): DayPlan {
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
  // One garnish for the whole day (cooked once): taken from what already stands in lunch/dinner, otherwise chosen from the seed.
  const byFoodId = new Map(input.foods.map((f) => [f.id, f]));
  const standing = [...keep.map((l) => l.foodId), ...(input.coveredBySlot?.lunch ?? []), ...(input.coveredBySlot?.dinner ?? [])];
  const garnishId =
    standing.find((id) => {
      const f = byFoodId.get(id);
      return f !== undefined && isGarnish(f);
    }) ?? candidatesFor(input.foods, { categories: [], match: isGarnish }, `${input.seed}|garnish`, input.avoidFoodIds)[0]?.id;
  const usedProteins = new Set<string>();
  for (const l of keep) {
    const f = byFoodId.get(l.foodId);
    if (f && isMainProtein(f)) usedProteins.add(f.id);
  }
  for (const slot of toBuild) {
    const k = SLOT_SHARE[slot] / shareSum;
    // In vacation mode a meal never shrinks below 60% of its usual share, otherwise a full day would always give the same smallest snack.
    const floor = (n: number, day: number): number => Math.max(0, n * k, input.mode === 'vacation' ? day * SLOT_SHARE[slot] * 0.6 : 0);
    const target: Macros = {
      kcal: floor(remaining.kcal, dayTarget.kcal),
      proteinG: floor(remaining.proteinG, dayTarget.proteinG),
      fatG: floor(remaining.fatG, dayTarget.fatG),
      carbG: floor(remaining.carbG, dayTarget.carbG),
      fiberG: floor(remaining.fiberG, dayTarget.fiberG),
    };
    const covered = [...(input.coveredBySlot?.[slot] ?? []), ...keep.filter((l) => l.slot === slot).map((l) => l.foodId)];
    const meal = generateMeal({ slot, target, foods: input.foods, rotation: input.seed, avoidFoodIds: input.avoidFoodIds, mode: input.mode, covered, garnishId, avoidProteinIds: new Set(usedProteins) });
    for (const l of meal) {
      const f = byFoodId.get(l.foodId);
      if (f && isMainProtein(f)) usedProteins.add(f.id);
    }
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

/** The day is built from a few deterministic variants of the seed; the first one within 3% of every target wins, otherwise the closest. */
export function generateDayPlan(input: DayPlanInput): DayPlan {
  const worst = (p: DayPlan): number => Math.max(Math.abs(p.deviation.kcal), Math.abs(p.deviation.proteinG), Math.abs(p.deviation.fatG), Math.abs(p.deviation.carbG));
  let best = buildDay(input);
  if (input.mode === 'vacation') return best;
  for (let k = 1; k < 8 && worst(best) > 0.03; k++) {
    const next = buildDay({ ...input, seed: `${input.seed}#${k}` });
    if (worst(next) + 1e-9 < worst(best)) best = next;
  }
  return best;
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
  const sorted = bestTier(options).sort((a, b) => PREF_RANK[a.preference] - PREF_RANK[b.preference] || a.name.localeCompare(b.name, 'ru'));
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
