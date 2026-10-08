import { diffDays, type LocalDate } from '../../util/localDate';
import { clampToRange, floorToGrid, type Grid } from '../common/grid';
import { DEFAULT_PROGRESSION_PARAMS, type ProgressionParams } from './params';
import type { RirTarget, SignalCode } from './types';

export interface DeloadEvaluationInput {
  forDate: LocalDate;
  /** End of the last deload, or the start of training if there has been none. */
  continuousLoadSince: LocalDate;
  /** Dates of the two most recent workouts, newest first. */
  recentWorkoutDates: LocalDate[];
  exercises: Array<{ exerciseId: string; lastSessionDate: LocalDate; signals: SignalCode[] }>;
}

export interface DeloadSuggestion {
  suggest: boolean;
  triggers: Array<{ code: 'several_exercises' | 'long_load_with_stall'; text: string }>;
  /** What the user sees: always names the cause; "8 weeks" alone never produces a suggestion. */
  reasonText: string;
  exerciseIds: string[];
}

/**
 * A suggestion, not an obligation. Triggers:
 *  - fatigue/stall in at least N exercises within the last two workouts;
 *  - at least 8 weeks of continuous load AND a detected stall.
 */
export function evaluateDeloadSuggestion(
  input: DeloadEvaluationInput,
  params: ProgressionParams = DEFAULT_PROGRESSION_PARAMS,
): DeloadSuggestion {
  const flagged = (codes: SignalCode[]) => codes.includes('fatigue') || codes.includes('stall');
  const recent = input.exercises.filter((e) => input.recentWorkoutDates.slice(0, 2).includes(e.lastSessionDate) && flagged(e.signals));
  const stalled = input.exercises.filter((e) => e.signals.includes('stall'));
  const weeks = Math.floor(diffDays(input.continuousLoadSince, input.forDate) / 7);

  const triggers: DeloadSuggestion['triggers'] = [];
  if (recent.length >= params.deload.exerciseCount) {
    triggers.push({
      code: 'several_exercises',
      text: `Усталость или застой в ${recent.length} упражнениях за последние две тренировки`,
    });
  }
  if (weeks >= params.deload.longLoadWeeks && stalled.length > 0) {
    triggers.push({
      code: 'long_load_with_stall',
      text: `${weeks} нед. непрерывной нагрузки и обнаружен застой`,
    });
  }
  const ids = [...new Set([...recent, ...(triggers.some((t) => t.code === 'long_load_with_stall') ? stalled : [])].map((e) => e.exerciseId))];
  return {
    suggest: triggers.length > 0,
    triggers,
    reasonText: triggers.length > 0 ? `Можно рассмотреть облегчённую неделю: ${triggers.map((t) => t.text).join('; ')}.` : '',
    exerciseIds: ids,
  };
}

/** The deload week for one exercise. Not a new program version: a temporary load event. */
export function buildDeloadPrescription(
  current: { weightKg: number | null; sets: number; rirTarget: RirTarget; grid: Grid },
  params: ProgressionParams = DEFAULT_PROGRESSION_PARAMS,
): { weightKg: number | null; sets: number; rirTarget: RirTarget; weeks: number } {
  const d = params.deload;
  const weightKg =
    current.weightKg === null ? null : clampToRange(floorToGrid(current.weightKg * d.weightFactor, current.grid), current.grid);
  const sets = current.sets <= d.minSets ? current.sets : Math.max(d.minSets, current.sets - d.setsReduction);
  const min = Math.min(4, Math.max(d.rirFloor, current.rirTarget.min));
  const max = Math.min(4, Math.max(min, current.rirTarget.max));
  return { weightKg, sets, rirTarget: { min, max }, weeks: d.weeks };
}
