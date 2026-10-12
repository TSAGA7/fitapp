import type { MealSlot, Macros, NutritionTargets } from '../../model';
import { dishesFor, describeMeal, isGarnish, isMainProtein, usable, type Dish, type DishPart } from './dishes';
import { macrosForAmount, subtractMacros, sumMacros } from './foods';
import { commonness, hash, PREF_RANK, snapGrams, step, type PlanFood } from './planfood';

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
  categories: string[];
  /** Holiday mode: picks foods by id instead of by category (and ignores the autoPlan flag). */
  match?: (f: PlanFood) => boolean;
  min: number;
  max: number;
  start: number;
  /** A fixed-size side is not fitted to the targets. */
  fixed?: boolean;
}

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
  fixed: boolean;
  grams: number;
  lo: number;
  hi: number;
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

const linesTotal = (vars: readonly Variable[]): Macros => sumMacros(vars.map((v) => macrosForAmount(v.food.per100, v.grams)));

/** Coordinate descent over the amounts: moves one item by one step while the error to the target shrinks. Deterministic. */
function fit(vars: Variable[], target: Macros): void {
  let best = error(linesTotal(vars), target);
  for (let iter = 0; iter < 400; iter++) {
    let improved = false;
    for (const v of vars) {
      if (v.fixed) continue;
      const s = step(v.food);
      for (const dir of [1, -1]) {
        const next = v.grams + dir * s;
        if (next < v.lo || next > v.hi || next < 0) continue;
        const cap = v.food.maxPerDayG;
        if (cap !== null && next > cap) continue;
        const prev = v.grams;
        v.grams = next;
        const e = error(linesTotal(vars), target);
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
  /** Foods not to take when there is anything else (e.g. the ones the user just asked to redo). */
  avoidFoodIds?: ReadonlySet<string>;
  mode?: DietMode;
  /** Food ids already present in this meal (eaten, skipped or kept): the parts they fill are not built again. */
  covered?: readonly string[];
  /** The garnish of the day: used for the garnish of lunch and dinner. */
  garnishId?: string;
  /** Proteins already used by other meals of the day: not repeated. */
  avoidProteinIds?: ReadonlySet<string>;
  /** Dishes not to repeat when there is anything else (what stood here before "redo", yesterday's dish). */
  avoidKinds?: ReadonlySet<string>;
  /** "From my favourites": every part of a dish is taken from the foods the user loves when there is one that fits. */
  favorites?: boolean;
}

// ---- holiday mode: loose holiday food picked by roles ----------------------------------------

const roleHas = (role: Pick<Role, 'categories' | 'match'>, f: PlanFood): boolean => (role.match ? role.match(f) : role.categories.includes(f.category));

function vacationAttempt(input: SlotInput, rotation: string): { vars: Variable[]; err: number } {
  const vars: Variable[] = [];
  const used = new Set<string>(input.avoidFoodIds ?? []);
  const coveredFoods = (input.covered ?? []).map((id) => input.foods.find((f) => f.id === id)).filter((f): f is PlanFood => f !== undefined);
  for (const role of VACATION_ROLES[input.slot]) {
    if (coveredFoods.some((f) => roleHas(role, f))) continue;
    const food = candidatesFor(input.foods, role, `${rotation}|${input.slot}|${role.name}`, used)[0];
    if (!food) continue;
    used.add(food.id);
    vars.push({ food, fixed: role.fixed === true, grams: snapGrams(food, role.start, role.min, role.max), lo: role.min, hi: role.max });
  }
  fit(vars, input.target);
  return { vars, err: error(linesTotal(vars), input.target) };
}

function vacationMeal(input: SlotInput): Variable[] {
  const tried = Array.from({ length: 40 }, (_, i) => vacationAttempt(input, i === 0 ? input.rotation : `${input.rotation}#${i}`));
  const best = tried.reduce((a, t) => (t.err + 1e-9 < a.err ? t : a));
  // Holiday food: any combination that fits about as well is fine, so "redo" gives something new instead of the single closest one.
  const near = tried.filter((t) => t.err <= best.err * 1.6 + 0.004);
  return (near[hash(`${input.rotation}|pick`) % near.length] ?? best).vars;
}

// ---- normal mode: dishes ------------------------------------------------------------------------

/** Picks one product for a part of a dish: liked products more often, the avoided ones only when there is nothing else. */
function pickFood(foods: readonly PlanFood[], part: DishPart, seed: string, taken: ReadonlySet<string>, avoid: ReadonlySet<string>, favorites = false): PlanFood | undefined {
  let list = foods.filter((f) => !taken.has(f.id) && usable(part, f));
  if (favorites) {
    const loved = list.filter((f) => f.preference === 'love');
    if (loved.length > 0) list = loved;
  }
  const fresh = list.filter((f) => !avoid.has(f.id));
  if (fresh.length > 0) list = fresh;
  if (list.length === 0) return undefined;
  list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const weight = (f: PlanFood): number => (f.preference === 'love' ? 4 : f.preference === 'like' ? 2 : 1);
  let r = hash(seed) % list.reduce((a, f) => a + weight(f), 0);
  for (const f of list) {
    r -= weight(f);
    if (r < 0) return f;
  }
  return list[0];
}

/** Assigns the products that already stand in the meal to the parts of a dish; nothing when one of them has no place in it. */
function coveredParts(dish: Dish, covered: readonly PlanFood[]): Set<string> | null {
  const out = new Set<string>();
  for (const f of covered) {
    const part = dish.parts.find((p) => !out.has(p.name) && p.match(f));
    if (!part) return null;
    out.add(part.name);
  }
  return out;
}

/** Below this an optional side (a spoon of cottage cheese next to the eggs) is dropped. */
const OPTIONAL_MIN_G = 50;

function dishAttempt(input: SlotInput, dish: Dish, covered: readonly PlanFood[], rotation: string): { vars: Variable[]; err: number } | null {
  const skip = coveredParts(dish, covered) ?? new Set<string>();
  const avoid = input.avoidFoodIds ?? new Set<string>();
  const taken = new Set<string>(covered.map((f) => f.id));
  const vars: Variable[] = [];
  for (const part of dish.parts) {
    if (skip.has(part.name)) continue;
    let food: PlanFood | undefined;
    if (part.name === 'garnish' && input.garnishId) {
      food = input.foods.find((f) => f.id === input.garnishId && part.match(f) && !f.excluded);
    } else {
      const avoidHere = part.name === 'protein' && input.avoidProteinIds ? new Set([...avoid, ...input.avoidProteinIds]) : avoid;
      food = pickFood(input.foods, part, `${rotation}|${input.slot}|${dish.kind}|${part.name}`, taken, avoidHere, input.favorites);
    }
    if (!food) {
      if (part.min === 0) continue;
      return null;
    }
    taken.add(food.id);
    vars.push({ food, fixed: part.fixed === true, grams: snapGrams(food, part.start, Math.max(part.min, 1), part.max), lo: part.min, hi: part.max });
  }
  if (vars.length === 0) return null;
  fit(vars, input.target);
  const optional = vars.filter((v) => v.lo === 0 && v.grams < OPTIONAL_MIN_G);
  if (optional.length > 0) {
    const kept = vars.filter((v) => !optional.includes(v));
    fit(kept, input.target);
    return { vars: kept, err: error(linesTotal(kept), input.target) };
  }
  return { vars, err: error(linesTotal(vars), input.target) };
}

/** Error margin within which any dish counts as "fits": the dish is then chosen for variety, not for the last gram. */
const DISH_TOLERANCE = 0.06;

function dishMeal(input: SlotInput): Variable[] {
  const byId = new Map(input.foods.map((f) => [f.id, f]));
  const covered = [...new Set(input.covered ?? [])].map((id) => byId.get(id)).filter((f): f is PlanFood => f !== undefined);
  const garnish = input.garnishId ? byId.get(input.garnishId) : undefined;
  let pool = dishesFor(input.slot).filter((d) => !d.garnish || (garnish !== undefined && d.garnish(garnish)));
  if (covered.length > 0) {
    const fitting = pool.filter((d) => coveredParts(d, covered) !== null);
    if (fitting.length > 0) pool = fitting;
    // Best of all: what was eaten is the main part of the dish (eaten cottage cheese → "cottage cheese with fruit", not eggs next to it).
    const around = pool.filter((d) => coveredParts(d, covered)?.has(d.parts[0]!.name));
    if (around.length > 0) pool = around;
  }
  const fresh = pool.filter((d) => !input.avoidKinds?.has(d.kind));
  if (fresh.length > 0) pool = fresh;
  const order = [...pool].sort((a, b) => hash(`${input.rotation}|${a.kind}`) - hash(`${input.rotation}|${b.kind}`));
  const tried: Array<{ vars: Variable[]; err: number }> = [];
  for (let i = 0; i < Math.min(24, order.length * 3); i++) {
    const r = dishAttempt(input, order[i % order.length] as Dish, covered, i < order.length ? input.rotation : `${input.rotation}#${i}`);
    if (r) tried.push(r);
  }
  if (tried.length === 0) return [];
  const best = tried.reduce((a, t) => (t.err + 1e-9 < a.err ? t : a));
  // The first dish (in the seed's order) that fits about as well as the best one: variety first, as long as the numbers hold.
  // Breakfast is first: whatever it misses is fitted by the meals after it, so any breakfast that is roughly right is fine.
  const tolerance = input.slot === 'breakfast' ? DISH_TOLERANCE * 2.5 : input.slot === 'snack' ? DISH_TOLERANCE * 2 : DISH_TOLERANCE;
  const fitting = tried.filter((t) => t.err <= best.err + tolerance);
  if (input.favorites) {
    // From favourites: of the dishes that fit, the one with the most loved foods (the first such in the seed's order).
    const loved = (t: { vars: Variable[] }): number => t.vars.filter((v) => v.food.preference === 'love').length;
    const most = Math.max(0, ...fitting.map(loved));
    return (fitting.find((t) => loved(t) === most) ?? best).vars;
  }
  return (fitting[0] ?? best).vars;
}

/** One meal: a dish of the meal's group (or holiday food), with the amounts fitted to the meal targets. */
export function generateMeal(input: SlotInput): PlanLine[] {
  const vars = input.mode === 'vacation' ? vacationMeal(input) : dishMeal(input);
  return vars
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
  /** Foods to change (e.g. the ones the user just asked to redo): not taken again when there is anything else. */
  avoidFoodIds?: ReadonlySet<string>;
  /** Food ids that already stand in a meal (eaten or skipped ones included): the matching parts of that meal are not built again. */
  coveredBySlot?: Partial<Record<MealSlot, readonly string[]>>;
  /** Dishes not to repeat in a meal when there is anything else: what stood there before "redo", yesterday's dish. */
  avoidKindsBySlot?: Partial<Record<MealSlot, readonly string[]>>;
  /** 'vacation': the day is built from holiday food (pizza, rolls, burgers, beer, wine...). */
  mode?: DietMode;
  /** Build the meals from the foods the user loves wherever they fit. */
  favorites?: boolean;
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
        if (next <= 0 || next < Math.max(g0 * 0.5, Math.min(g0, 50)) || next > g0 * 1.7) continue;
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
          if (nb <= 0 || na > ga * 1.7 || nb < Math.max(gb * 0.5, Math.min(gb, 50))) continue;
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
  const fixed = locked.filter((l) => !slots.includes(l.slot) || l.locked);
  const keep = [...fixed, ...(input.keepLines ?? [])];
  const toBuild = SLOTS.filter((s) => slots.includes(s) && !fixed.some((l) => l.slot === s && l.locked));
  const dayTarget: Macros = { kcal: input.targets.kcal, proteinG: input.targets.proteinG, fatG: input.targets.fatG, carbG: input.targets.carbG, fiberG: input.targets.fiberG };
  const lines: PlanLine[] = [...keep];
  const vacation = input.mode === 'vacation';
  // One garnish for the whole day (cooked once): taken from what already stands in lunch/dinner, otherwise chosen from the seed.
  const byFoodId = new Map(input.foods.map((f) => [f.id, f]));
  const standing = [...keep.filter((l) => l.slot === 'lunch' || l.slot === 'dinner').map((l) => l.foodId), ...(input.coveredBySlot?.lunch ?? []), ...(input.coveredBySlot?.dinner ?? [])];
  const garnishId = vacation
    ? undefined
    : (standing.find((id) => {
        const f = byFoodId.get(id);
        return f !== undefined && isGarnish(f);
      }) ?? pickGarnish(input));
  const usedProteins = new Set<string>();
  for (const l of keep) {
    const f = byFoodId.get(l.foodId);
    if (f && isMainProtein(f)) usedProteins.add(f.id);
  }
  let lunchKind = mealDish('lunch', lines.filter((l) => l.slot === 'lunch').map((l) => l.foodId), input.foods)?.kind;
  // Meals are built in their order and each gets its share of what is STILL left: a lighter breakfast leaves more to lunch, dinner and the snack.
  for (let i = 0; i < toBuild.length; i++) {
    const slot = toBuild[i] as MealSlot;
    const left = subtractMacros(dayTarget, sumMacros(lines.map((l) => l.macros)));
    const k = SLOT_SHARE[slot] / toBuild.slice(i).reduce((a, s) => a + SLOT_SHARE[s], 0);
    // In vacation mode a meal never shrinks below 60% of its usual share, otherwise a full day would always give the same smallest snack.
    const floor = (n: number, day: number): number => Math.max(0, n * k, vacation ? day * SLOT_SHARE[slot] * 0.6 : 0);
    const target: Macros = {
      kcal: floor(left.kcal, dayTarget.kcal),
      proteinG: floor(left.proteinG, dayTarget.proteinG),
      fatG: floor(left.fatG, dayTarget.fatG),
      carbG: floor(left.carbG, dayTarget.carbG),
      fiberG: floor(left.fiberG, dayTarget.fiberG),
    };
    const covered = [...(input.coveredBySlot?.[slot] ?? []), ...keep.filter((l) => l.slot === slot).map((l) => l.foodId)];
    const meal = generateMeal({
      slot,
      target,
      foods: input.foods,
      rotation: input.seed,
      avoidFoodIds: input.avoidFoodIds,
      mode: input.mode,
      covered,
      garnishId,
      avoidProteinIds: new Set(usedProteins),
      avoidKinds: new Set([...(input.avoidKindsBySlot?.[slot] ?? []), ...(slot === 'dinner' && lunchKind ? [lunchKind] : [])]),
      favorites: input.favorites,
    });
    // Dinner is another dish than lunch (the garnish stays the same: it is cooked once).
    if (slot === 'lunch') lunchKind = mealDish('lunch', meal.map((l) => l.foodId), input.foods)?.kind;
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

/**
 * After something was eaten differently from the plan: the amounts of the meals still to eat are refitted so the day ends at its
 * targets — the products and dishes stay as they are (only the grams move, within 50–170% of what was planned).
 */
export function refitDay(input: { targets: NutritionTargets; foods: readonly PlanFood[]; keep: readonly PlanLine[]; lines: readonly PlanLine[] }): PlanLine[] {
  const keep = input.keep.map((l) => ({ ...l }));
  const free = input.lines.map((l) => ({ ...l }));
  const t = input.targets;
  refineDay([...keep, ...free], keep, input.foods, { kcal: t.kcal, proteinG: t.proteinG, fatG: t.fatG, carbG: t.carbG, fiberG: t.fiberG });
  return free;
}

/** The garnish of the day: rice, buckwheat, pasta, potatoes... by the seed; the one that is being redone only when there is nothing else. */
function pickGarnish(input: DayPlanInput): string | undefined {
  const part = { match: isGarnish, tier: 0 as const };
  const list = input.foods.filter((f) => usable(part, f)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const loved = input.favorites ? list.filter((f) => f.preference === 'love') : [];
  const base = loved.length > 0 ? loved : list;
  const fresh = base.filter((f) => !input.avoidFoodIds?.has(f.id));
  const pool = fresh.length > 0 ? fresh : base;
  return pool.length > 0 ? pool[hash(`${input.seed}|garnish`) % pool.length]?.id : undefined;
}

/** Which dish a meal is (kind and a readable title); nothing for a meal put together by hand. */
export function mealDish(slot: MealSlot, foodIds: readonly string[], foods: readonly PlanFood[]): { kind: string; title: string } | null {
  const byId = new Map(foods.map((f) => [f.id, f]));
  return describeMeal(slot, foodIds.map((id) => byId.get(id)).filter((f): f is PlanFood => f !== undefined));
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
