import type { NutritionTargets, PlanChange, TrainingPlanSnapshot } from '../../model';

type Diff = PlanChange['diff'];

const NUTRITION_KEYS: Array<keyof NutritionTargets> = ['kcal', 'proteinG', 'fatG', 'carbG', 'fiberG', 'waterMl'];

export function diffNutrition(before: NutritionTargets | null, after: NutritionTargets): Diff {
  const out: Diff = [];
  for (const k of NUTRITION_KEYS) {
    if (before === null || before[k] !== after[k]) out.push({ path: `nutrition.${k}`, before: before ? before[k] : null, after: after[k] });
  }
  return out;
}

/** What changed between two training plans: workouts added/removed, exercises swapped, sets/rep ranges changed. */
export function diffTraining(before: TrainingPlanSnapshot | null, after: TrainingPlanSnapshot): Diff {
  const out: Diff = [];
  if (before === null) {
    out.push({ path: 'training.workouts', before: null, after: after.workouts.map((w) => w.key) });
    return out;
  }
  const bw = new Map(before.workouts.map((w) => [w.key, w]));
  const aw = new Map(after.workouts.map((w) => [w.key, w]));
  for (const key of new Set([...bw.keys(), ...aw.keys()])) {
    const b = bw.get(key);
    const a = aw.get(key);
    if (!b) out.push({ path: `training.${key}`, before: null, after: a?.label ?? null });
    else if (!a) out.push({ path: `training.${key}`, before: b.label, after: null });
    else {
      const bx = new Map(b.exercises.map((e) => [e.key, e]));
      const ax = new Map(a.exercises.map((e) => [e.key, e]));
      for (const ek of new Set([...bx.keys(), ...ax.keys()])) {
        const be = bx.get(ek);
        const ae = ax.get(ek);
        if (!be) out.push({ path: `training.${key}.${ek}`, before: null, after: ae?.exerciseId ?? null });
        else if (!ae) out.push({ path: `training.${key}.${ek}`, before: be.exerciseId, after: null });
        else {
          for (const f of ['exerciseId', 'variantKey', 'sets', 'repMin', 'repMax'] as const) {
            if (be[f] !== ae[f]) out.push({ path: `training.${key}.${ek}.${f}`, before: be[f], after: ae[f] });
          }
        }
      }
    }
  }
  if (before.adaptationWeeks !== after.adaptationWeeks) out.push({ path: 'training.adaptationWeeks', before: before.adaptationWeeks, after: after.adaptationWeeks });
  if (before.rotation.join() !== after.rotation.join()) out.push({ path: 'training.rotation', before: before.rotation, after: after.rotation });
  return out;
}

/** True during the adaptation weeks counted from the start of the plan. */
export function inAdaptation(plan: Pick<TrainingPlanSnapshot, 'adaptationWeeks' | 'startsOn'>, date: string): boolean {
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${plan.startsOn}T00:00:00Z`)) / 86_400_000;
  return days < plan.adaptationWeeks * 7;
}
