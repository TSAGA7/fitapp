import type { Profile, TrainingPlanSnapshot, TrainingSchedule } from '../../model';
import { WEEKDAYS } from '../../model';
import { addDays, dateRange, diffDays, weekdayOf, type LocalDate } from '../../util/localDate';

export const isTrainingDay = (schedule: TrainingSchedule, date: LocalDate): boolean => schedule[weekdayOf(date)];

/** Number of training days in [from, to) according to the schedule. */
function countTrainingDays(schedule: TrainingSchedule, from: LocalDate, to: LocalDate): number {
  let n = 0;
  for (let d = from; d < to; d = addDays(d, 1)) if (isTrainingDay(schedule, d)) n++;
  return n;
}

/**
 * The workout of a date: the k-th training day since the start of the plan gets rotation[k % length].
 * It is a pure function of the plan and the schedule, so it is stable and needs no stored counter.
 */
export function workoutKeyForDate(plan: Pick<TrainingPlanSnapshot, 'rotation' | 'startsOn'>, schedule: TrainingSchedule, date: LocalDate): string | null {
  if (!isTrainingDay(schedule, date) || date < plan.startsOn || plan.rotation.length === 0) return null;
  const k = countTrainingDays(schedule, plan.startsOn, date);
  return plan.rotation[k % plan.rotation.length] ?? null;
}

export interface WeekSlot {
  date: LocalDate;
  workoutKey: string;
}

/** The training days of the [from, from+days) window with their workouts. */
export function scheduleWindow(plan: Pick<TrainingPlanSnapshot, 'rotation' | 'startsOn'>, schedule: TrainingSchedule, from: LocalDate, days: number): WeekSlot[] {
  const out: WeekSlot[] = [];
  for (const d of dateRange(from, addDays(from, days - 1))) {
    const key = workoutKeyForDate(plan, schedule, d);
    if (key) out.push({ date: d, workoutKey: key });
  }
  return out;
}

/**
 * Where to move a missed workout: the nearest later day (within 3 days) that has no workout; a rest day is
 * preferred. Moving changes only the date of that session, never the program version.
 */
export function suggestMoveDate(missed: LocalDate, schedule: TrainingSchedule, occupied: ReadonlySet<LocalDate>, today: LocalDate): LocalDate | null {
  const start = missed < today ? today : addDays(missed, 1);
  for (let i = 0; i < 4; i++) {
    const d = addDays(start, i);
    if (occupied.has(d)) continue;
    return d;
  }
  return null;
}

export const trainingsPerWeek = (profile: Pick<Profile, 'trainingSchedule'>): number => WEEKDAYS.filter((d) => profile.trainingSchedule[d]).length;
export { diffDays };
