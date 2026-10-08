import type { GoalType, NutritionTargets, Sex } from '../../model';
import type { WeightTrend } from '../analysis/weight';
import { MIN_KCAL } from './energy';

/** Healthy corridor of weekly weight change, in % of body weight, by goal. */
export const EXPECTED_RATE_PCT: Record<GoalType, { min: number; max: number }> = {
  fat_loss: { min: -1.0, max: -0.4 },
  recomposition: { min: -0.5, max: 0.0 },
  muscle_gain: { min: 0.1, max: 0.5 },
  muscle_retention: { min: -0.25, max: 0.25 },
  strength: { min: -0.1, max: 0.4 },
  functional_fitness: { min: -0.3, max: 0.3 },
};

export interface AdjustInput {
  goal: GoalType;
  sex: Sex;
  targets: NutritionTargets;
  weight: WeightTrend;
  /** Days since the current targets began to apply. */
  daysOnTargets: number;
}

export interface TargetAdjustment {
  reasonCode: 'rate_too_fast_down' | 'rate_too_slow_down' | 'rate_too_fast_up' | 'rate_too_slow_up';
  reasonText: string;
  kcalDelta: number;
  newTargets: NutritionTargets;
  evidence: { ratePctPerWeek: number; rateKgPerWeek: number; corridor: { min: number; max: number }; daysOnTargets: number };
}

const MIN_DAYS = 14;
const STEP_PCT = 0.05;

/**
 * Compares the real weight trend with the corridor for the goal and, when it is clearly outside, proposes a
 * small change of calories (5%). Protein and fat stay, the difference goes to carbohydrates. Returns nothing
 * while the data is too thin: the app never changes the plan on one or two weigh-ins.
 */
export function suggestTargetAdjustment(i: AdjustInput): TargetAdjustment | null {
  const w = i.weight;
  if (i.daysOnTargets < MIN_DAYS || !w.rateReliable || w.rateKgPerWeek === null || w.avg7 === null || w.avg7 <= 0) return null;
  const pct = (w.rateKgPerWeek / w.avg7) * 100;
  const corridor = EXPECTED_RATE_PCT[i.goal];
  const margin = 0.1;
  let direction = 0;
  let code: TargetAdjustment['reasonCode'];
  let text: string;
  const rate = `${w.rateKgPerWeek > 0 ? '+' : ''}${w.rateKgPerWeek.toFixed(2).replace('.', ',')} кг/нед`;
  if (pct < corridor.min - margin) {
    direction = 1;
    code = corridor.min < 0 && pct < corridor.min - margin ? 'rate_too_fast_down' : 'rate_too_slow_up';
    text = `Вес меняется быстрее, чем нужно для цели (${rate}). Добавляем ${Math.round(STEP_PCT * 100)}% калорий, чтобы не терять мышцы и силу.`;
  } else if (pct > corridor.max + margin) {
    direction = -1;
    code = corridor.max > 0 ? 'rate_too_fast_up' : 'rate_too_slow_down';
    text = corridor.max > 0
      ? `Вес растёт быстрее, чем нужно для набора мышц (${rate}). Убираем ${Math.round(STEP_PCT * 100)}% калорий, чтобы набирать меньше жира.`
      : `Вес снижается медленнее, чем нужно для цели (${rate}). Убираем ${Math.round(STEP_PCT * 100)}% калорий.`;
  } else return null;

  const floor = MIN_KCAL[i.sex];
  const kcalDelta = Math.round((i.targets.kcal * STEP_PCT * direction) / 10) * 10;
  const kcal = Math.max(floor, i.targets.kcal + kcalDelta);
  if (kcal === i.targets.kcal) return null;
  const carbG = Math.max(100, Math.round((kcal - i.targets.proteinG * 4 - i.targets.fatG * 9) / 20) * 5);
  const total = Math.round(i.targets.proteinG * 4 + i.targets.fatG * 9 + carbG * 4);
  const newTargets: NutritionTargets = { ...i.targets, kcal: total, carbG, fiberG: Math.round((14 * total) / 1000) };
  return {
    reasonCode: code,
    reasonText: text,
    kcalDelta: total - i.targets.kcal,
    newTargets,
    evidence: { ratePctPerWeek: Math.round(pct * 100) / 100, rateKgPerWeek: w.rateKgPerWeek, corridor, daysOnTargets: i.daysOnTargets },
  };
}
