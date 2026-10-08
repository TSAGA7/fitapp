import type { Experience, GoalType, JobActivity, NutritionTargets, Sex } from '../../model';

export interface EnergyInput {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  jobActivity: JobActivity;
  trainingsPerWeek: number;
  goal: GoalType;
}

export interface EnergyResult {
  bmr: number;
  activityFactor: number;
  tdee: number;
  /** Fraction applied to TDEE for the goal (-0.1 = 10% deficit). */
  goalAdjustment: number;
  targets: NutritionTargets;
  proteinPerKg: number;
  /** Plain-language lines that explain the numbers. */
  notes: string[];
}

const JOB_FACTOR: Record<JobActivity, number> = { sedentary: 1.2, light: 1.3, moderate: 1.4, heavy: 1.5 };
export const GOAL_ADJUSTMENT: Record<GoalType, number> = {
  fat_loss: -0.2,
  recomposition: -0.1,
  muscle_gain: 0.1,
  muscle_retention: 0,
  strength: 0.05,
  functional_fitness: 0,
};
const PROTEIN_PER_KG: Record<GoalType, number> = {
  fat_loss: 2.2,
  recomposition: 2.0,
  muscle_gain: 1.8,
  muscle_retention: 1.8,
  strength: 1.8,
  functional_fitness: 1.6,
};

/** Never go below these energy intakes, whatever the goal asks. */
export const MIN_KCAL: Record<Sex, number> = { male: 1600, female: 1300, unspecified: 1450 };

const round = (n: number, step: number): number => Math.round(n / step) * step;

/** Mifflin-St Jeor resting energy, kcal/day. */
export function basalMetabolicRate(i: Pick<EnergyInput, 'sex' | 'ageYears' | 'heightCm' | 'weightKg'>): number {
  const sexTerm = i.sex === 'male' ? 5 : i.sex === 'female' ? -161 : -78;
  return 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.ageYears + sexTerm;
}

export function activityFactor(job: JobActivity, trainingsPerWeek: number): number {
  const sessions = Math.max(0, Math.min(6, trainingsPerWeek));
  return Math.round((JOB_FACTOR[job] + 0.025 * sessions) * 1000) / 1000;
}

/** Splits a calorie target into protein / fat / carbohydrate / fibre / water. Protein and fat are set first, carbs fill the rest. */
export function macrosForKcal(kcal: number, weightKg: number, goal: GoalType): NutritionTargets {
  const proteinG = round(PROTEIN_PER_KG[goal] * weightKg, 5);
  const fatG = round(Math.max(0.8 * weightKg, (0.25 * kcal) / 9), 5);
  const carbG = Math.max(100, Math.ceil((kcal - proteinG * 4 - fatG * 9) / 20) * 5);
  const total = Math.round(proteinG * 4 + fatG * 9 + carbG * 4);
  return {
    kcal: total,
    proteinG,
    fatG,
    carbG,
    fiberG: Math.round((14 * total) / 1000),
    waterMl: round(weightKg * 33, 50),
  };
}

/** Daily targets from body data, activity and goal. Deterministic, no medical advice. */
export function computeTargets(i: EnergyInput): EnergyResult {
  const bmr = basalMetabolicRate(i);
  const factor = activityFactor(i.jobActivity, i.trainingsPerWeek);
  const tdee = bmr * factor;
  const adjustment = GOAL_ADJUSTMENT[i.goal];
  const floor = MIN_KCAL[i.sex];
  const wanted = round(tdee * (1 + adjustment), 10);
  const kcal = Math.max(floor, wanted);
  const targets = macrosForKcal(kcal, i.weightKg, i.goal);
  const notes = [
    `Базовый обмен ${Math.round(bmr)} ккал (формула Миффлина — Сан-Жеора).`,
    `С учётом работы и ${i.trainingsPerWeek} тренировок в неделю расход около ${Math.round(tdee)} ккал.`,
    adjustment === 0 ? 'Цель — поддержание, калории на уровне расхода.' : `Для цели ${adjustment < 0 ? 'дефицит' : 'профицит'} ${Math.abs(Math.round(adjustment * 100))}%.`,
  ];
  if (kcal > wanted) notes.push(`Калории подняты до безопасного минимума ${floor} ккал.`);
  return { bmr: Math.round(bmr), activityFactor: factor, tdee: Math.round(tdee), goalAdjustment: adjustment, targets, proteinPerKg: PROTEIN_PER_KG[i.goal], notes };
}

/** Number of training sessions per week that fits a given experience (used when the schedule is not set). */
export const defaultSessionsPerWeek = (e: Experience): number => (e === 'beginner' ? 3 : e === 'intermediate' ? 4 : 4);
