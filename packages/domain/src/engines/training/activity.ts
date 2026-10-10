/**
 * Workout activity: a rough estimate of the energy spent and a comparison with the previous time.
 * It is information for the athlete only. It is never added to the day's calorie norm and never frees room in the meal plan.
 */

export interface ActivitySet {
  weightKg: number | null;
  /** Repetitions, or seconds for timed exercises. */
  reps: number;
}

export interface ActivityExercise {
  compound: boolean;
  /** Held or timed work (plank, vacuum, cardio): `reps` are seconds. */
  timed: boolean;
  sets: ActivitySet[];
}

export interface ActivityEstimate {
  /** Active kilocalories above rest: the middle of the range. */
  kcalMid: number;
  kcalLow: number;
  kcalHigh: number;
  workSec: number;
  restSec: number;
  elapsedSec: number;
  tonnageKg: number;
  sets: number;
  reps: number;
}

/** Seconds one repetition takes (a controlled tempo). */
export const SEC_PER_REP = 3;
/**
 * METs above rest (gross MET minus 1). Anchored on the Compendium of Physical Activities, where a whole resistance session
 * (sets AND the pauses between them) is about 3.5-6 gross: a hard compound set is ~7 gross, an isolation set ~5.5,
 * timed work and easy cardio ~4, and the pause between sets (standing, changing weights) ~2.8.
 */
export const NET_MET = { compound: 6, isolation: 4.5, timed: 3, rest: 1.8 } as const;
/** The honest uncertainty of the estimate (individual error of a formula like this is about this much). */
export const KCAL_SPREAD = 0.3;
const MAX_ELAPSED_SEC = 4 * 3600;

const roundTo = (n: number, step: number): number => Math.round(n / step) * step;

/** The pause between two sets that still counts as "in the workout"; a longer gap is a break the athlete took (a call, a coffee). */
const MAX_GAP_SEC = 8 * 60;
/** Lead-in before the first set (warming up, setting the weight) that counts, however long the workout page stood open before it. */
const MAX_LEAD_SEC = 3 * 60;

/**
 * Seconds the workout really took. Time is counted from the first set: the page may have been opened hours before the
 * first working set, and a break longer than 8 minutes between sets is not counted. After the last set a short rest is
 * allowed (5 min while live, 2 min after finishing), so a forgotten open app does not inflate the time.
 */
export function sessionElapsedSec(input: { startedAtMs: number; completedAtMs: readonly number[]; endedAtMs: number | null; nowMs: number }): number {
  const live = input.endedAtMs === null;
  const end = input.endedAtMs ?? input.nowMs;
  const done = [...input.completedAtMs].sort((a, b) => a - b);
  if (done.length === 0) return Math.min(MAX_LEAD_SEC, Math.max(0, Math.round((end - input.startedAtMs) / 1000)));
  let sec = Math.min(MAX_LEAD_SEC, Math.max(0, (done[0]! - input.startedAtMs) / 1000));
  for (let i = 1; i < done.length; i++) sec += Math.min(MAX_GAP_SEC, (done[i]! - done[i - 1]!) / 1000);
  sec += Math.min((live ? 5 : 2) * 60, Math.max(0, (end - done[done.length - 1]!) / 1000));
  return Math.min(MAX_ELAPSED_SEC, Math.max(0, Math.round(sec)));
}

export function estimateWorkout(input: { bodyWeightKg: number; exercises: readonly ActivityExercise[]; elapsedSec: number }): ActivityEstimate {
  let workSec = 0;
  let activeKcal = 0;
  let tonnage = 0;
  let sets = 0;
  let reps = 0;
  const kg = Math.max(30, input.bodyWeightKg);
  for (const ex of input.exercises) {
    const met = ex.timed ? NET_MET.timed : ex.compound ? NET_MET.compound : NET_MET.isolation;
    for (const s of ex.sets) {
      const sec = ex.timed ? s.reps : s.reps * SEC_PER_REP;
      workSec += sec;
      activeKcal += (met * kg * sec) / 3600;
      sets += 1;
      if (!ex.timed) {
        reps += s.reps;
        tonnage += (s.weightKg ?? 0) * s.reps;
      }
    }
  }
  const elapsedSec = Math.max(input.elapsedSec, workSec);
  const restSec = Math.max(0, elapsedSec - workSec);
  const kcal = activeKcal + (NET_MET.rest * kg * restSec) / 3600;
  const step = kcal < 100 ? 5 : 10;
  return {
    kcalMid: roundTo(kcal, step),
    kcalLow: roundTo(kcal * (1 - KCAL_SPREAD), step),
    kcalHigh: roundTo(kcal * (1 + KCAL_SPREAD), step),
    workSec: Math.round(workSec),
    restSec: Math.round(restSec),
    elapsedSec: Math.round(elapsedSec),
    tonnageKg: Math.round(tonnage),
    sets,
    reps,
  };
}

// ---------------------------------------------------------------- progress against the previous time

export interface BestSet {
  weightKg: number | null;
  reps: number;
}

/** Strength score of a set: estimated one-rep max for loaded work (Epley), reps or seconds otherwise. */
export const setStrength = (s: BestSet): number => (s.weightKg !== null && s.weightKg > 0 ? s.weightKg * (1 + s.reps / 30) : s.reps);

export function bestSet(sets: readonly BestSet[]): BestSet | null {
  let best: BestSet | null = null;
  for (const s of sets) if (best === null || setStrength(s) > setStrength(best)) best = s;
  return best;
}

export type ProgressVerdict = 'up' | 'down' | 'same' | 'first';

/** A change smaller than this is "same": it is within the noise of a day. */
export const PROGRESS_EPSILON = 0.02;

export interface ProgressComparison {
  verdict: ProgressVerdict;
  /** Change of the strength score in percent (null for the first time). */
  deltaPct: number | null;
}

export function compareProgress(current: BestSet | null, previous: BestSet | null): ProgressComparison | null {
  if (current === null) return null;
  if (previous === null) return { verdict: 'first', deltaPct: null };
  const a = setStrength(current);
  const b = setStrength(previous);
  if (b <= 0) return { verdict: 'first', deltaPct: null };
  const d = (a - b) / b;
  return { verdict: d >= PROGRESS_EPSILON ? 'up' : d <= -PROGRESS_EPSILON ? 'down' : 'same', deltaPct: Math.round(d * 1000) / 10 };
}

export interface SummaryExerciseInput extends ActivityExercise {
  exerciseId: string;
  name: string;
  /** Best set of the previous workout with this exercise (before this one). */
  previousBest: BestSet | null;
}

export interface SummaryExercise {
  exerciseId: string;
  name: string;
  timed: boolean;
  best: BestSet;
  previousBest: BestSet | null;
  verdict: ProgressVerdict;
  deltaPct: number | null;
}

export interface WorkoutSummary {
  activity: ActivityEstimate;
  exercises: SummaryExercise[];
  up: number;
  down: number;
  same: number;
  first: number;
}

export function summarizeWorkout(input: { bodyWeightKg: number; exercises: readonly SummaryExerciseInput[]; elapsedSec: number }): WorkoutSummary {
  const done = input.exercises.filter((e) => e.sets.length > 0);
  const out: SummaryExercise[] = [];
  for (const e of done) {
    const best = bestSet(e.sets);
    const cmp = compareProgress(best, e.previousBest);
    if (best === null || cmp === null) continue;
    out.push({ exerciseId: e.exerciseId, name: e.name, timed: e.timed, best, previousBest: e.previousBest, verdict: cmp.verdict, deltaPct: cmp.deltaPct });
  }
  return {
    activity: estimateWorkout({ bodyWeightKg: input.bodyWeightKg, exercises: done, elapsedSec: input.elapsedSec }),
    exercises: out,
    up: out.filter((x) => x.verdict === 'up').length,
    down: out.filter((x) => x.verdict === 'down').length,
    same: out.filter((x) => x.verdict === 'same').length,
    first: out.filter((x) => x.verdict === 'first').length,
  };
}
