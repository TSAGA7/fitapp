import type { MealSlot } from '../../model';
import { commonness, type PlanFood } from './planfood';

/**
 * The menu is built from DISHES, not from loose products: each meal picks a dish of its group
 * (breakfasts for breakfast, hot dishes for lunch and dinner, snacks), then the products of the dish, then the amounts.
 * "Redo" swaps the dish itself, so a breakfast of eggs becomes porridge or a toast, not the same eggs with other grams.
 */

type Match = (f: PlanFood) => boolean;

export interface DishPart {
  /** Unique inside the dish. */
  name: string;
  match: Match;
  min: number;
  max: number;
  start: number;
  /** A fixed-size side (a fruit, a salad vegetable) is not fitted to the targets. */
  fixed?: boolean;
  /** Only the everyday products are taken (see commonness): 0 = everyday only, 1 = also "now and then". */
  tier?: 0 | 1;
}

export interface Dish {
  kind: string;
  slots: readonly MealSlot[];
  parts: readonly DishPart[];
  /** Lunch and dinner: the dish is built around the garnish of the day and only when it suits this garnish. */
  garnish?: Match;
  title: (p: Readonly<Record<string, PlanFood>>) => string;
}

const ids = (...keys: string[]): Match => {
  const set = new Set(keys);
  return (f) => set.has(f.id);
};
const auto = (f: PlanFood): boolean => f.autoPlan !== false;
const or = (...ms: Match[]): Match => (f) => ms.some((m) => m(f));
const named = (re: RegExp, extra: Match = () => true): Match => (f) => auto(f) && re.test(f.name) && extra(f);

/** A short name for a title: "Куриное филе (грудка), варёное" → "куриное филе". */
export const shortName = (f: PlanFood): string => (f.name.split(/[,(]/)[0] ?? f.name).trim().toLowerCase();

// ---- product groups -------------------------------------------------------------------------

const OAT_PORRIDGE = or(ids('oat_cooked', 'oat_milk_cooked'), named(/овсян|геркулес/i, (f) => f.category === 'grains' && f.basis === 'cooked'));
const RICE_PORRIDGE = or(ids('rice_porridge_milk', 'rice_porridge_water'), named(/рисов\S* каш/i));
const MUESLI = or(ids('muesli'), named(/мюсли/i));
const FRIED_EGGS = or(ids('egg_fried'), named(/яичниц/i));
const BOILED_EGG = or(ids('egg_boiled'), named(/яйц\S* варён/i));
const OMELET = or(ids('omelet'), named(/омлет/i));
const SCRAMBLE = or(ids('scrambled_eggs'), named(/скр[эе]мбл/i));
const BREAD = or(ids('whole_grain_bread', 'bread_borodinsky', 'bread_rye', 'rye_bread', 'bread_black'), named(/хлеб (ржан|цельнозерн|бородин|чёрн|черн)/i));
const AVOCADO = or(ids('avocado'), named(/авокадо/i));
const RED_FISH = or(ids('trout_salted', 'salmon_salted'), named(/(форел|лосос|сёмг|семг)\S* слабосол|слабосол\S* (форел|лосос|сёмг|семг)/i));
const CHEESE = or(ids('cheese_hard_17', 'cheese_light'), named(/сыр (лёгк|легк|твёрд|твердый 1)/i));
const COTTAGE = named(/творог/i, (f) => f.category === 'dairy');
const YOGURT = named(/йогурт (греч|натурал)|скир/i, (f) => f.category === 'dairy');
const KEFIR = named(/кефир|айран/i, (f) => f.category === 'dairy');
const MILK = named(/^молоко/i, (f) => f.category === 'dairy');
const FRUIT = (f: PlanFood): boolean => auto(f) && f.category === 'fruits' && f.basis !== 'as_sold';
const NUTS = (f: PlanFood): boolean => auto(f) && f.category === 'nuts_seeds';
const HONEY = or(ids('honey'), named(/^мёд|^мед$/i));
const SHAKE = (f: PlanFood): boolean => auto(f) && f.category === 'supplements' && f.per100.proteinG >= 50;
const SALAD_A = (f: PlanFood): boolean => auto(f) && f.category === 'vegetables' && /огур|капуст/i.test(f.name) && !/квашен|солён/i.test(f.name);
const SALAD_B = (f: PlanFood): boolean => auto(f) && f.category === 'vegetables' && /помидор|томат|перец|морков/i.test(f.name);
const FRESH_VEG = or(SALAD_A, SALAD_B);
const STEW_VEG = (f: PlanFood): boolean => auto(f) && f.category === 'vegetables' && /кабач|перец|капуст|морков|шампин|брокк|цветн|баклаж|стручк/i.test(f.name) && !/квашен/i.test(f.name);
const TOMATO = (f: PlanFood): boolean => auto(f) && f.category === 'vegetables' && /помидор|томат/i.test(f.name);
const CUCUMBER = (f: PlanFood): boolean => auto(f) && f.category === 'vegetables' && /огур/i.test(f.name) && !/солён/i.test(f.name);
const BOWL_EXTRA = or(ids('corn_canned', 'avocado', 'chickpeas_canned'), named(/кукуруз/i, (f) => f.category === 'canned'));

export const isMainProtein = (f: PlanFood): boolean => auto(f) && ['poultry', 'fish', 'meat', 'seafood'].includes(f.category) && f.basis !== 'raw' && !/печен|слабосол/i.test(f.name);
export const isGarnish = (f: PlanFood): boolean =>
  auto(f) && f.basis !== 'raw' && ((f.category === 'grains' && !/овсян|мюсли|каш|хлоп/i.test(f.name)) || (f.category === 'vegetables' && /картоф|батат/i.test(f.name))) && !/лапш/i.test(f.name);
const PASTA = (f: PlanFood): boolean => /макарон|паст|спагет/i.test(f.name);
const RICE = (f: PlanFood): boolean => /рис/i.test(f.name) && !/лапш/i.test(f.name);
const LEAN_PROTEIN_FOR_PASTA = (f: PlanFood): boolean => isMainProtein(f) && /курин|индейк|фарш|кревет|тунец|кальмар/i.test(f.name);
const FISH_OR_CHICKEN = (f: PlanFood): boolean => isMainProtein(f) && (f.category === 'fish' || f.category === 'seafood' || /курин/i.test(f.name));

const lc = (f: PlanFood | undefined): string => (f ? shortName(f) : '');
/** "Яичница с тостом" + an optional side: "Яичница с тостом, творог 5%". */
const plus = (base: string, side: PlanFood | undefined): string => (side ? `${base}, ${lc(side)}` : base);
const porridgeName = (f: PlanFood | undefined): string => (f ? f.name.replace(/\s*\(.*\)$/, '') : 'Каша');

// ---- the dishes -------------------------------------------------------------------------------

const BREAKFASTS: Dish[] = [
  {
    kind: 'oat_porridge',
    slots: ['breakfast'],
    parts: [
      { name: 'base', match: OAT_PORRIDGE, min: 180, max: 400, start: 250 },
      { name: 'fruit', match: FRUIT, min: 80, max: 200, start: 120, fixed: true, tier: 1 },
      { name: 'nuts', match: NUTS, min: 10, max: 30, start: 15, tier: 0 },
      { name: 'protein', match: or(COTTAGE, YOGURT), min: 80, max: 250, start: 150 },
    ],
    title: (p) => plus(`${porridgeName(p.base)} с фруктом и орехами`, p.protein),
  },
  {
    kind: 'rice_porridge',
    slots: ['breakfast'],
    parts: [
      { name: 'base', match: RICE_PORRIDGE, min: 180, max: 380, start: 250 },
      { name: 'fruit', match: FRUIT, min: 80, max: 200, start: 120, fixed: true, tier: 1 },
      { name: 'protein', match: or(COTTAGE, YOGURT, BOILED_EGG), min: 55, max: 250, start: 150 },
    ],
    title: (p) => plus(`${porridgeName(p.base)} с фруктом`, p.protein),
  },
  {
    kind: 'muesli_yogurt',
    slots: ['breakfast'],
    parts: [
      { name: 'muesli', match: MUESLI, min: 30, max: 90, start: 50 },
      { name: 'yogurt', match: YOGURT, min: 150, max: 350, start: 200 },
      { name: 'fruit', match: FRUIT, min: 80, max: 200, start: 120, fixed: true, tier: 1 },
    ],
    title: () => 'Мюсли с йогуртом и фруктом',
  },
  {
    kind: 'muesli_milk',
    slots: ['breakfast'],
    parts: [
      { name: 'muesli', match: MUESLI, min: 30, max: 90, start: 50 },
      { name: 'milk', match: or(MILK, KEFIR), min: 150, max: 300, start: 200 },
      { name: 'protein', match: COTTAGE, min: 80, max: 250, start: 150 },
    ],
    title: (p) => plus(`Мюсли с ${p.milk && /кефир/i.test(p.milk.name) ? 'кефиром' : 'молоком'}`, p.protein),
  },
  {
    kind: 'fried_eggs',
    slots: ['breakfast'],
    parts: [
      { name: 'eggs', match: FRIED_EGGS, min: 100, max: 200, start: 150 },
      { name: 'bread', match: BREAD, min: 25, max: 90, start: 40 },
      { name: 'veg', match: FRESH_VEG, min: 100, max: 150, start: 120, fixed: true, tier: 1 },
      { name: 'protein', match: or(COTTAGE, YOGURT), min: 80, max: 250, start: 120 },
    ],
    title: (p) => plus('Яичница с тостом и свежими овощами', p.protein),
  },
  {
    kind: 'boiled_eggs',
    slots: ['breakfast'],
    parts: [
      { name: 'eggs', match: BOILED_EGG, min: 110, max: 220, start: 110 },
      { name: 'bread', match: BREAD, min: 25, max: 90, start: 40 },
      { name: 'veg', match: FRESH_VEG, min: 100, max: 150, start: 120, fixed: true, tier: 1 },
      { name: 'protein', match: or(COTTAGE, YOGURT, CHEESE), min: 0, max: 250, start: 100 },
    ],
    title: (p) => plus('Варёные яйца, хлеб и свежие овощи', p.protein),
  },
  {
    kind: 'omelet',
    slots: ['breakfast'],
    parts: [
      { name: 'omelet', match: OMELET, min: 150, max: 350, start: 220 },
      { name: 'veg', match: or(TOMATO, STEW_VEG), min: 80, max: 150, start: 100, fixed: true, tier: 1 },
      { name: 'bread', match: BREAD, min: 25, max: 90, start: 35 },
      { name: 'protein', match: or(COTTAGE, YOGURT), min: 0, max: 200, start: 100 },
    ],
    title: (p) => plus(`Омлет с овощами (${lc(p.veg)}) и хлебом`, p.protein),
  },
  {
    kind: 'scramble',
    slots: ['breakfast'],
    parts: [
      { name: 'scramble', match: SCRAMBLE, min: 120, max: 300, start: 180 },
      { name: 'bread', match: BREAD, min: 25, max: 90, start: 40 },
      { name: 'veg', match: TOMATO, min: 80, max: 150, start: 100, fixed: true },
      { name: 'protein', match: or(COTTAGE, YOGURT), min: 0, max: 200, start: 100 },
    ],
    title: (p) => plus('Скрэмбл на тосте с помидорами', p.protein),
  },
  {
    kind: 'avocado_toast',
    slots: ['breakfast'],
    parts: [
      { name: 'bread', match: BREAD, min: 30, max: 100, start: 50 },
      { name: 'avocado', match: AVOCADO, min: 30, max: 80, start: 50 },
      { name: 'fish', match: RED_FISH, min: 30, max: 120, start: 60 },
      { name: 'protein', match: or(COTTAGE, YOGURT, BOILED_EGG), min: 0, max: 250, start: 110 },
    ],
    title: (p) => plus(`Тост с авокадо и слабосолёной рыбой (${lc(p.fish)})`, p.protein),
  },
  {
    kind: 'yogurt_bowl',
    slots: ['breakfast'],
    parts: [
      { name: 'yogurt', match: YOGURT, min: 150, max: 350, start: 250 },
      { name: 'muesli', match: MUESLI, min: 20, max: 60, start: 30 },
      { name: 'fruit', match: FRUIT, min: 80, max: 200, start: 120, fixed: true, tier: 1 },
      { name: 'nuts', match: NUTS, min: 10, max: 30, start: 15, tier: 0 },
    ],
    title: () => 'Йогуртовый боул с мюсли, фруктом и орехами',
  },
  {
    kind: 'kefir_sandwich',
    slots: ['breakfast'],
    parts: [
      { name: 'kefir', match: KEFIR, min: 200, max: 400, start: 250 },
      { name: 'bread', match: BREAD, min: 25, max: 90, start: 40 },
      { name: 'cheese', match: CHEESE, min: 15, max: 45, start: 25 },
      { name: 'eggs', match: BOILED_EGG, min: 55, max: 165, start: 110 },
    ],
    title: () => 'Кефир, бутерброд с сыром и варёные яйца',
  },
  {
    kind: 'cottage_bowl',
    slots: ['breakfast'],
    parts: [
      { name: 'cottage', match: COTTAGE, min: 150, max: 350, start: 220 },
      { name: 'fruit', match: FRUIT, min: 80, max: 200, start: 120, fixed: true, tier: 1 },
      { name: 'nuts', match: NUTS, min: 10, max: 30, start: 15, tier: 0 },
      { name: 'honey', match: HONEY, min: 10, max: 15, start: 10, fixed: true },
    ],
    title: () => 'Творог с фруктом, орехами и мёдом',
  },
];

const MAINS: Dish[] = [
  {
    kind: 'main_salad',
    slots: ['lunch', 'dinner'],
    parts: [
      { name: 'protein', match: isMainProtein, min: 80, max: 300, start: 150, tier: 1 },
      { name: 'garnish', match: isGarnish, min: 30, max: 300, start: 150, tier: 0 },
      { name: 'vegA', match: SALAD_A, min: 70, max: 120, start: 90, fixed: true, tier: 1 },
      { name: 'vegB', match: SALAD_B, min: 70, max: 120, start: 90, fixed: true, tier: 1 },
    ],
    title: (p) => `${cap(lc(p.protein))}, ${lc(p.garnish)} и салат (${lc(p.vegA)}, ${lc(p.vegB)})`,
  },
  {
    kind: 'main_stew',
    slots: ['lunch', 'dinner'],
    parts: [
      { name: 'protein', match: isMainProtein, min: 80, max: 300, start: 150, tier: 1 },
      { name: 'garnish', match: isGarnish, min: 30, max: 300, start: 150, tier: 0 },
      { name: 'veg', match: STEW_VEG, min: 120, max: 250, start: 150, fixed: true, tier: 1 },
    ],
    title: (p) => `${cap(lc(p.protein))}, ${lc(p.garnish)} и тушёные овощи (${lc(p.veg)})`,
  },
  {
    kind: 'pasta',
    slots: ['lunch', 'dinner'],
    garnish: PASTA,
    parts: [
      { name: 'garnish', match: isGarnish, min: 80, max: 300, start: 180 },
      { name: 'protein', match: LEAN_PROTEIN_FOR_PASTA, min: 80, max: 250, start: 130, tier: 1 },
      { name: 'veg', match: TOMATO, min: 80, max: 150, start: 100, fixed: true },
    ],
    title: (p) => `Паста с томатами: ${lc(p.protein)}`,
  },
  {
    kind: 'bowl',
    slots: ['lunch', 'dinner'],
    garnish: RICE,
    parts: [
      { name: 'garnish', match: isGarnish, min: 80, max: 300, start: 170 },
      { name: 'protein', match: FISH_OR_CHICKEN, min: 80, max: 250, start: 130, tier: 1 },
      { name: 'veg', match: CUCUMBER, min: 70, max: 120, start: 90, fixed: true },
      { name: 'extra', match: BOWL_EXTRA, min: 40, max: 80, start: 50, fixed: true },
    ],
    title: (p) => `Боул: ${lc(p.garnish)}, ${lc(p.protein)}, огурец, ${lc(p.extra)}`,
  },
];

const SNACKS: Dish[] = [
  {
    kind: 'snack_cottage',
    slots: ['snack'],
    parts: [
      { name: 'cottage', match: COTTAGE, min: 80, max: 300, start: 150 },
      { name: 'fruit', match: FRUIT, min: 80, max: 200, start: 120, fixed: true, tier: 1 },
    ],
    title: () => 'Творог с фруктом',
  },
  {
    kind: 'snack_yogurt',
    slots: ['snack'],
    parts: [
      { name: 'yogurt', match: YOGURT, min: 100, max: 400, start: 200 },
      { name: 'nuts', match: NUTS, min: 10, max: 35, start: 15, tier: 0 },
      { name: 'fruit', match: FRUIT, min: 0, max: 200, start: 120, tier: 1 },
    ],
    title: (p) => (p.fruit ? 'Йогурт с орехами и фруктом' : 'Йогурт с орехами'),
  },
  {
    kind: 'snack_kefir',
    slots: ['snack'],
    parts: [
      { name: 'kefir', match: KEFIR, min: 200, max: 400, start: 250 },
      { name: 'cottage', match: COTTAGE, min: 0, max: 250, start: 100 },
      { name: 'fruit', match: FRUIT, min: 80, max: 200, start: 120, fixed: true, tier: 1 },
    ],
    title: (p) => (p.cottage ? 'Кефир, творог и фрукт' : 'Кефир и фрукт'),
  },
  {
    kind: 'snack_eggs',
    slots: ['snack'],
    parts: [
      { name: 'eggs', match: BOILED_EGG, min: 55, max: 165, start: 110 },
      { name: 'veg', match: FRESH_VEG, min: 80, max: 150, start: 100, fixed: true, tier: 1 },
      { name: 'protein', match: or(COTTAGE, YOGURT), min: 0, max: 250, start: 100 },
    ],
    title: (p) => plus('Варёные яйца со свежими овощами', p.protein),
  },
  {
    kind: 'snack_shake',
    slots: ['snack'],
    parts: [
      { name: 'shake', match: SHAKE, min: 20, max: 60, start: 30 },
      { name: 'fruit', match: FRUIT, min: 80, max: 200, start: 120, fixed: true, tier: 1 },
    ],
    title: () => 'Протеиновый коктейль и фрукт',
  },
];

const cap = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

export const DISHES: readonly Dish[] = [...BREAKFASTS, ...MAINS, ...SNACKS];
export const dishesFor = (slot: MealSlot): Dish[] => DISHES.filter((d) => d.slots.includes(slot));

/** Whether a food may be picked by the generator for a part (preferences, exclusions and how everyday it is). */
export function usable(part: Pick<DishPart, 'match' | 'tier'>, f: PlanFood): boolean {
  if (f.excluded || f.preference === 'avoid' || f.availability === 'rare' || !part.match(f)) return false;
  return part.tier === undefined || commonness(f) <= part.tier;
}

/**
 * Which dish a set of products is (the kind and a readable title), or nothing when it is not one of the dishes
 * (the meal was put together by hand). Every product has to belong to a distinct part of the dish.
 */
export function describeMeal(slot: MealSlot, mealFoods: readonly PlanFood[]): { kind: string; title: string } | null {
  if (mealFoods.length === 0) return null;
  let best: { kind: string; title: string; score: number } | null = null;
  for (const dish of dishesFor(slot)) {
    const assigned = assign(dish, mealFoods);
    if (!assigned) continue;
    const filled = Object.keys(assigned).length;
    // The dish has to be recognisable: at least its first (main) part and half of its parts are there.
    if (!assigned[dish.parts[0]!.name] || filled * 2 < dish.parts.length) continue;
    const score = filled / dish.parts.length;
    if (!best || score > best.score) best = { kind: dish.kind, title: dish.title(assigned), score };
  }
  return best ? { kind: best.kind, title: best.title } : null;
}

/** Puts every product into a distinct part of the dish (small backtracking); nothing when one does not fit. */
function assign(dish: Dish, foods: readonly PlanFood[]): Record<string, PlanFood> | null {
  const out: Record<string, PlanFood> = {};
  const go = (i: number): boolean => {
    if (i === foods.length) return true;
    const f = foods[i]!;
    for (const part of dish.parts) {
      if (out[part.name] || !part.match(f)) continue;
      out[part.name] = f;
      if (go(i + 1)) return true;
      delete out[part.name];
    }
    return false;
  };
  return go(0) ? out : null;
}
