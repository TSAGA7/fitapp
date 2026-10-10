import { describe, expect, it } from 'vitest';
import { loadSeedCatalog } from '../../../../seed/src';
const rawSeedCatalog = loadSeedCatalog();
import type { Food } from '../../model';
import { analyzeWeight } from '../analysis/weight';
import { computeTargets, macrosForKcal, MIN_KCAL, recommendedWaterMl } from './energy';
import { suggestTargetAdjustment } from './adjust';
import { counterpart, macrosForAmount, sumMacros } from './foods';
import { generateDayPlan, generateMeal, remainingMacros, replaceFood, type PlanFood } from './mealplan';

const foods = rawSeedCatalog.foods.map((f) => ({
  id: f.key, name: f.name, category: f.category, basis: f.basis, per100: f.per100, unit: f.unit, gramsPerPiece: f.gramsPerPiece,
  preference: 'ok', availability: 'always', excluded: false, maxPerDayG: null, autoPlan: f.autoPlan,
})) as PlanFood[];

const cat100 = (id: string) => foods.find((f) => f.id === id)!.per100;
const base = { sex: 'male' as const, ageYears: 29, heightCm: 181, weightKg: 82.5, jobActivity: 'sedentary' as const, trainingsPerWeek: 3 };

describe('energy', () => {
  it('computes BMR/TDEE and a recomposition deficit', () => {
    const r = computeTargets({ ...base, goal: 'recomposition' });
    expect(r.bmr).toBe(Math.round(10 * 82.5 + 6.25 * 181 - 5 * 29 + 5));
    expect(r.activityFactor).toBeCloseTo(1.275, 3);
    expect(r.targets.kcal).toBeGreaterThan(1900);
    expect(r.targets.kcal).toBeLessThan(2400);
    expect(r.targets.proteinG).toBe(165);
    const sum = r.targets.proteinG * 4 + r.targets.fatG * 9 + r.targets.carbG * 4;
    expect(Math.abs(sum - r.targets.kcal)).toBeLessThanOrEqual(2);
  });
  it('never goes under the safe minimum', () => {
    const r = computeTargets({ ...base, sex: 'female', weightKg: 45, heightCm: 150, ageYears: 50, goal: 'fat_loss' });
    expect(r.targets.kcal).toBeGreaterThanOrEqual(MIN_KCAL.female);
    expect(r.notes.join(' ')).toContain('минимума');
  });
  it('water guide depends on sex', () => {
    expect(recommendedWaterMl(82.5, 'male')).toBe(2700);
    expect(recommendedWaterMl(82.5, 'female')).toBe(2500);
    expect(recommendedWaterMl(82.5, 'unspecified')).toBe(2700);
    expect(macrosForKcal(2000, 82.5, 'fat_loss', 'female').waterMl).toBe(2500);
  });
  it('fat has a floor per kg', () => {
    expect(macrosForKcal(2000, 100, 'fat_loss').fatG).toBeGreaterThanOrEqual(80);
  });
});

describe('foods', () => {
  it('scales per-100 values', () => {
    expect(macrosForAmount({ kcal: 200, proteinG: 10, fatG: 5, carbG: 30, fiberG: 2 }, 150)).toEqual({ kcal: 300, proteinG: 15, fatG: 7.5, carbG: 45, fiberG: 3 });
  });
  it('converts raw <-> cooked weight with the yield factor', () => {
    const mk = (id: string, basis: 'raw' | 'cooked', yieldFactor: number | null) => ({ id, basis, variantGroup: 'rice', yieldFactor, deletedAt: null }) as unknown as Food;
    const raw = mk('rice_dry', 'raw', null);
    const cooked = mk('rice_cooked', 'cooked', 2.5);
    expect(counterpart(raw, [raw, cooked])?.toOtherGrams(100)).toBe(250);
    expect(counterpart(cooked, [raw, cooked])?.toOtherGrams(250)).toBe(100);
  });
});

describe('meal plan', () => {
  const targets = computeTargets({ ...base, goal: 'recomposition' }).targets;
  it('builds a day close to the targets, deterministically', () => {
    const a = generateDayPlan({ targets, foods, seed: '2026-10-08' });
    const b = generateDayPlan({ targets, foods, seed: '2026-10-08' });
    expect(a).toEqual(b);
    expect(Math.abs(a.deviation.kcal)).toBeLessThan(0.08);
    expect(Math.abs(a.deviation.proteinG)).toBeLessThan(0.12);
    expect(new Set(a.lines.map((l) => l.slot)).size).toBe(4);
  });
  it('the day total lands within 4% of the day targets for several seeds', () => {
    const t = { kcal: 1865, proteinG: 180, fatG: 65, carbG: 140, fiberG: 26, waterMl: 2700 };
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', '2026-10-08', '2026-10-09']) {
      const d = generateDayPlan({ targets: t, foods, seed }).deviation;
      expect(Math.abs(d.kcal), seed).toBeLessThan(0.04);
      expect(Math.abs(d.proteinG), seed).toBeLessThan(0.08);
    }
  });
  it('every macro of a day lands within 5% for a whole month of seeds and other targets', () => {
    const sets = [
      { kcal: 1865, proteinG: 180, fatG: 65, carbG: 140, fiberG: 26, waterMl: 2700 },
      { kcal: 1500, proteinG: 120, fatG: 55, carbG: 150, fiberG: 21, waterMl: 2000 },
      { kcal: 2600, proteinG: 160, fatG: 85, carbG: 300, fiberG: 36, waterMl: 2900 },
    ];
    for (const t of sets) {
      for (let i = 0; i < 30; i++) {
        const d = generateDayPlan({ targets: t, foods, seed: `2026-10-${i}|1` }).deviation;
        for (const k of ['kcal', 'proteinG', 'fatG', 'carbG'] as const) expect(Math.abs(d[k]), `${t.kcal} ${i} ${k}`).toBeLessThan(0.05);
      }
    }
  });
  it('vacation mode builds the day from holiday food only and still lands near the calories', () => {
    const t = { kcal: 1865, proteinG: 180, fatG: 65, carbG: 140, fiberG: 26, waterMl: 2700 };
    const holiday = /^(pizza_|[a-z]+_pizza_|vit_|bk_|rostics_|roll_|maki_|nigiri_|sushi_rolls|gunkan|philadelphia_roll|california_roll|baked_roll|tempura_roll|spicy_roll|unagi_roll|chicken_roll|inari|dodo_|cheburek|samsa_meat|teremok_|potato_fries|nuggets_chicken|gyoza|shrimp_tempura|salad_|pie_|bun_|croissant|vatrushka_|latte|juice_|cola|sprite|fanta|energy_drink|beer_|wine_|champagne_)/;
    for (let i = 0; i < 12; i++) {
      const plan = generateDayPlan({ targets: t, foods, seed: `v${i}`, mode: 'vacation' });
      expect(plan.lines.length).toBeGreaterThanOrEqual(6);
      for (const l of plan.lines) expect(holiday.test(l.foodId), l.foodId).toBe(true);
      expect(Math.abs(plan.deviation.kcal), `seed ${i}`).toBeLessThan(0.12);
    }
    const normal = generateDayPlan({ targets: t, foods, seed: 'v0' });
    expect(normal.lines.some((l) => /^(pizza_|beer_|wine_|champagne_)/.test(l.foodId))).toBe(false);
  });
  it('meals are dishes: one garnish per meal, the same garnish for lunch and dinner, no standalone oil, spinach or potato-as-vegetable', () => {
    const cat = new Map(foods.map((f) => [f.id, f]));
    const isGarnish = (id: string): boolean => {
      const f = cat.get(id)!;
      return (f.category === 'grains' && !/овсян|мюсли/i.test(f.name)) || /картоф|батат/i.test(f.name);
    };
    for (let i = 0; i < 40; i++) {
      const plan = generateDayPlan({ targets, foods, seed: `dish-${i}` });
      const ids = plan.lines.map((l) => l.foodId);
      expect(ids.some((id) => cat.get(id)!.category === 'fats_oils'), `oil ${i}`).toBe(false);
      expect(ids.includes('spinach'), `spinach ${i}`).toBe(false);
      const main = (slot: string) => plan.lines.filter((l) => l.slot === slot && isGarnish(l.foodId)).map((l) => l.foodId);
      expect(main('lunch').length, `lunch garnish ${i}`).toBe(1);
      expect(main('dinner').length, `dinner garnish ${i}`).toBe(1);
      expect(main('lunch')[0], `same garnish ${i}`).toBe(main('dinner')[0]);
      expect(main('breakfast').length, `breakfast ${i}`).toBe(0);
      const proteins = plan.lines.filter((l) => (l.slot === 'lunch' || l.slot === 'dinner') && ['poultry', 'fish', 'meat', 'seafood'].includes(cat.get(l.foodId)!.category)).map((l) => l.foodId);
      expect(new Set(proteins).size, `proteins ${i}`).toBe(proteins.length);
    }
  });
  it('only everyday products are picked on their own: bananas and apples, cucumbers and tomatoes, no strawberries, broccoli or hazelnuts', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) for (const l of generateDayPlan({ targets, foods, seed: `usual-${i}` }).lines) seen.add(l.foodId);
    for (const bad of ['strawberry', 'broccoli', 'hazelnuts', 'kiwi', 'grapes', 'cauliflower', 'bulgur_dry', 'bulgur_cooked', 'salmon_raw', 'trout_raw']) expect(seen.has(bad), bad).toBe(false);
    const fruit = [...seen].filter((id) => foods.find((f) => f.id === id)?.category === 'fruits');
    expect(fruit.every((id) => ['banana', 'apple'].includes(id)), fruit.join()).toBe(true);
    const veg = [...seen].filter((id) => foods.find((f) => f.id === id)?.category === 'vegetables' && !/potato/.test(id));
    expect(veg.every((id) => ['cucumber', 'tomato'].includes(id)), veg.join()).toBe(true);
  });
  it('a product the user loves counts as everyday', () => {
    const loved = foods.map((f) => (f.id === 'strawberry' ? { ...f, preference: 'love' as const } : f));
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) for (const l of generateDayPlan({ targets, foods: loved, seed: `love-${i}` }).lines) seen.add(l.foodId);
    expect(seen.has('strawberry')).toBe(true);
  });
  it('a meal that already holds an eaten protein is not given a second one', () => {
    const eaten = { slot: 'breakfast' as const, foodId: 'cottage_cheese_5', grams: 200, macros: macrosForAmount(cat100('cottage_cheese_5'), 200), locked: false };
    const plan = generateDayPlan({ targets, foods, seed: 'x', keepLines: [eaten], coveredBySlot: { breakfast: ['cottage_cheese_5'] }, slots: ['breakfast', 'lunch', 'dinner', 'snack'] });
    const bf = plan.lines.filter((l) => l.slot === 'breakfast');
    const proteinish = bf.filter((l) => ['dairy', 'eggs'].includes(foods.find((f) => f.id === l.foodId)!.category));
    expect(proteinish.map((l) => l.foodId)).toEqual(['cottage_cheese_5']);
  });
  it('another seed gives another set of foods', () => {
    const ids = (seed: string) => generateDayPlan({ targets, foods, seed }).lines.map((l) => l.foodId).join();
    const variants = new Set(['a', 'b', 'c', 'd', 'e'].map(ids));
    expect(variants.size).toBeGreaterThan(1);
  });
  it('respects excluded and avoided foods', () => {
    const f = foods.map((x) => (x.category === 'poultry' ? { ...x, excluded: true } : x.id === 'salmon_raw' ? { ...x, preference: 'avoid' as const } : x));
    const plan = generateDayPlan({ targets, foods: f, seed: 'x' });
    for (const l of plan.lines) {
      const food = f.find((x) => x.id === l.foodId) as PlanFood;
      expect(food.excluded || l.foodId === 'salmon_raw').toBe(false);
    }
  });
  it('keeps locked lines and refits only the other meals', () => {
    const first = generateDayPlan({ targets, foods, seed: 's1' });
    const lockedLines = first.lines.filter((l) => l.slot === 'breakfast').map((l) => ({ ...l, locked: true }));
    const again = generateDayPlan({ targets, foods, seed: 's2', locked: lockedLines });
    expect(again.lines.filter((l) => l.slot === 'breakfast')).toEqual(lockedLines);
    expect(Math.abs(again.deviation.kcal)).toBeLessThan(0.1);
  });
  it('regenerates one meal only', () => {
    const first = generateDayPlan({ targets, foods, seed: 's1' });
    const keep = first.lines.filter((l) => l.slot !== 'dinner').map((l) => ({ ...l, locked: true }));
    const again = generateDayPlan({ targets, foods, seed: 's9', locked: keep, slots: ['dinner'] });
    expect(again.lines.filter((l) => l.slot !== 'dinner')).toEqual(keep);
    expect(again.lines.some((l) => l.slot === 'dinner')).toBe(true);
  });
  it('replaces a product by another of the same kind keeping the protein', () => {
    const meal = generateMeal({ slot: 'lunch', target: { kcal: 700, proteinG: 50, fatG: 20, carbG: 80, fiberG: 8 }, foods, rotation: 'r' });
    const protein = meal[0]!;
    const swapped = replaceFood(protein, foods, 'again');
    expect(swapped).toBeDefined();
    expect(swapped!.foodId).not.toBe(protein.foodId);
    expect(Math.abs(swapped!.macros.proteinG - protein.macros.proteinG)).toBeLessThan(8);
  });
  it('remaining macros never go below zero', () => {
    expect(remainingMacros({ ...targets }, { kcal: 9999, proteinG: 999, fatG: 999, carbG: 999, fiberG: 99 }).kcal).toBe(0);
    expect(sumMacros([]).kcal).toBe(0);
  });
});

describe('target adjustment', () => {
  const t = computeTargets({ ...base, goal: 'recomposition' }).targets;
  const trend = (rate: number) => ({ ...analyzeWeight([]), count: 20, currentKg: 82, avg7: 82, avg30: 82, rateKgPerWeek: rate, rateReliable: true });
  it('does nothing when the trend is inside the corridor or data is thin', () => {
    expect(suggestTargetAdjustment({ goal: 'recomposition', sex: 'male', targets: t, weight: trend(-0.2), daysOnTargets: 30 })).toBeNull();
    expect(suggestTargetAdjustment({ goal: 'recomposition', sex: 'male', targets: t, weight: trend(-1.2), daysOnTargets: 5 })).toBeNull();
    expect(suggestTargetAdjustment({ goal: 'recomposition', sex: 'male', targets: t, weight: { ...trend(-1.2), rateReliable: false }, daysOnTargets: 30 })).toBeNull();
  });
  it('adds calories when weight falls too fast and removes when it does not move for a deficit goal', () => {
    const up = suggestTargetAdjustment({ goal: 'recomposition', sex: 'male', targets: t, weight: trend(-1.2), daysOnTargets: 30 });
    expect(up?.kcalDelta).toBeGreaterThan(0);
    expect(up?.newTargets.proteinG).toBe(t.proteinG);
    const down = suggestTargetAdjustment({ goal: 'fat_loss', sex: 'male', targets: t, weight: trend(0.1), daysOnTargets: 30 });
    expect(down?.kcalDelta).toBeLessThan(0);
  });
});
