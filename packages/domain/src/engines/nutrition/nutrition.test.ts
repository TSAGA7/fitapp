import { describe, expect, it } from 'vitest';
import { loadSeedCatalog } from '../../../../seed/src';
const rawSeedCatalog = loadSeedCatalog();
import type { Food } from '../../model';
import { analyzeWeight } from '../analysis/weight';
import { computeTargets, macrosForKcal, MIN_KCAL } from './energy';
import { suggestTargetAdjustment } from './adjust';
import { counterpart, macrosForAmount, sumMacros } from './foods';
import { generateDayPlan, generateMeal, remainingMacros, replaceFood, type PlanFood } from './mealplan';

const foods = rawSeedCatalog.foods.map((f) => ({
  id: f.key, name: f.name, category: f.category, basis: f.basis, per100: f.per100, unit: f.unit, gramsPerPiece: f.gramsPerPiece,
  preference: 'ok', availability: 'always', excluded: false, maxPerDayG: null, autoPlan: f.autoPlan,
})) as PlanFood[];

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
