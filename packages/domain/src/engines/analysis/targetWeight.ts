import type { GoalType, Sex } from '../../model';

export interface TargetWeightAdvice {
  /** The suggested target, rounded to 0.5 kg. */
  kg: number;
  /** A reasonable range around it (the healthy BMI band clipped by the goal). */
  minKg: number;
  maxKg: number;
  /** What it is based on, in plain words. */
  basis: string;
}

const HEALTHY_BMI = { min: 18.5, max: 24.9 } as const; // WHO adult range
const round5 = (n: number): number => Math.round(n * 2) / 2;
/** Waist-to-height ratio above 0.5 means extra abdominal fat (NICE 2022; Ashwell 2012). One kg lost takes about 1 cm off the waist: a rough, individual figure. */
const CM_PER_KG = 1;

/**
 * A suggested target weight from height, current weight, goal and, when known, the waist. It is a guide, not a prescription:
 * the person can always type their own.
 */
export function recommendTargetWeight(input: { sex: Sex; heightCm: number; weightKg: number; goal: GoalType; waistCm: number | null }): TargetWeightAdvice {
  const h = input.heightCm / 100;
  const bmiWeight = (bmi: number): number => bmi * h * h;
  const lo = bmiWeight(HEALTHY_BMI.min);
  const hi = bmiWeight(HEALTHY_BMI.max);
  const w = input.weightKg;
  const bmi = w / (h * h);
  const keep = (basis: string): TargetWeightAdvice => ({ kg: round5(w), minKg: round5(Math.max(lo, w - 2)), maxKg: round5(w + 2), basis });

  switch (input.goal) {
    case 'fat_loss': {
      const whtr = input.waistCm !== null ? input.waistCm / input.heightCm : null;
      if (whtr !== null && whtr > 0.5) {
        const loss = (input.waistCm! - 0.5 * input.heightCm) / CM_PER_KG;
        const kg = Math.max(w - loss, bmiWeight(20));
        return { kg: round5(kg), minKg: round5(Math.max(lo, kg - 2)), maxKg: round5(Math.min(w, kg + 2)), basis: `Талия ${Math.round(input.waistCm!)} см при росте ${Math.round(input.heightCm)} см: чтобы талия стала меньше половины роста, нужно примерно ${Math.round(loss)} кг` };
      }
      if (bmi > 24) return { kg: round5(bmiWeight(23)), minKg: round5(lo), maxKg: round5(hi), basis: `Индекс массы тела сейчас ${bmi.toFixed(1)}: здоровый диапазон ВОЗ 18,5–24,9, цель в его верхней-средней части` };
      return keep('Вес уже в здоровом диапазоне. Жир уходит и без падения веса: следи за талией, вес лучше держать около текущего');
    }
    case 'muscle_gain': {
      const kg = w * 1.04;
      return { kg: round5(kg), minKg: round5(w), maxKg: round5(w * 1.06), basis: 'Набор мышц идёт медленно: около 0,25% веса в неделю, то есть примерно 3–4 кг чистого прироста за 4 месяца' };
    }
    default:
      return keep('Для этой цели вес не главное: держи его около текущего и смотри на талию, силу и самочувствие');
  }
}
