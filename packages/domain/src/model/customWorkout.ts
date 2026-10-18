import { z } from 'zod';
import { entityBase, LocalDateSchema } from './common';
import { WeekdaySchema } from './weekday';
import { addDays, dateRange, weekdayOf, type LocalDate } from '../util/localDate';

/** One exercise of a workout the user put together himself: how many sets, which rep range, how long to rest. */
export const CustomWorkoutExercise = z
  .object({
    exerciseId: z.string().min(1),
    sets: z.number().int().min(1).max(10),
    repMin: z.number().int().min(1).max(300),
    repMax: z.number().int().min(1).max(300),
    restSec: z.number().int().min(15).max(600),
  })
  .refine((e) => e.repMin <= e.repMax, 'repMin must be <= repMax');
export type CustomWorkoutExercise = z.infer<typeof CustomWorkoutExercise>;

/**
 * A workout outside the program, built by the user ("my own leg day"): saved to be repeated.
 * Starting it never touches the program: no new version, the rotation and the calendar stay as they are.
 */
export const CustomWorkout = z.object({
  ...entityBase,
  name: z.string().trim().min(1).max(60),
  exercises: z.array(CustomWorkoutExercise).min(1).max(20),
  useCount: z.number().int().min(0),
  lastUsedOn: LocalDateSchema.nullable(),
});
export type CustomWorkout = z.infer<typeof CustomWorkout>;

/** workoutKey of the planned session behind a workout that is not in the program. */
export const BODYWEIGHT_WORKOUT_KEY = 'bodyweight';
export const CUSTOM_WORKOUT_KEY = 'custom';
export const customWorkoutKey = (id: string | null): string => (id ? `${CUSTOM_WORKOUT_KEY}:${id}` : CUSTOM_WORKOUT_KEY);
/** The saved custom workout a session came from (null for an empty one or one that is not custom). */
export const customWorkoutIdOf = (workoutKey: string): string | null => (workoutKey.startsWith(`${CUSTOM_WORKOUT_KEY}:`) ? workoutKey.slice(CUSTOM_WORKOUT_KEY.length + 1) : null);
export const isCustomWorkoutKey = (workoutKey: string): boolean => workoutKey === CUSTOM_WORKOUT_KEY || workoutKey.startsWith(`${CUSTOM_WORKOUT_KEY}:`);
/** Workouts started outside the program (at home, my own): they never take a slot of the program calendar. */
export const isAdHocWorkoutKey = (workoutKey: string): boolean => workoutKey === BODYWEIGHT_WORKOUT_KEY || isCustomWorkoutKey(workoutKey);

/** A day of the own plan changed by hand: another own workout, or rest (null). */
export const OwnScheduleOverride = z.object({ date: LocalDateSchema, customWorkoutId: z.string().min(1).nullable() });
export type OwnScheduleOverride = z.infer<typeof OwnScheduleOverride>;

/**
 * The own program planned ahead («Своя» mode): own workouts in turn on the chosen weekdays, for some weeks.
 * Only the rule is stored; the days are derived (ownScheduleDays), so a long plan costs nothing and never goes stale.
 * Done or not is read from the workouts themselves. The main program is never touched.
 */
export const OwnSchedule = z.object({
  ...entityBase,
  startOn: LocalDateSchema,
  weeks: z.number().int().min(1).max(52),
  weekdays: z.array(WeekdaySchema).min(1).max(7),
  /** Own workout ids in the order they follow each other. */
  rotation: z.array(z.string().min(1)).min(1).max(14),
  overrides: z.array(OwnScheduleOverride).max(400),
});
export type OwnSchedule = z.infer<typeof OwnSchedule>;

export interface OwnScheduleDay {
  date: LocalDate;
  /** null: the day was turned into rest by hand. */
  customWorkoutId: string | null;
  /** Changed by hand (another workout, rest, or an extra day). */
  changed: boolean;
}

/** The planned days of the own program, in date order: rotation over the weekdays, then the hand changes on top. */
export function ownScheduleDays(s: Pick<OwnSchedule, 'startOn' | 'weeks' | 'weekdays' | 'rotation' | 'overrides'>): OwnScheduleDay[] {
  const end = addDays(s.startOn, s.weeks * 7 - 1);
  const days = new Set(s.weekdays);
  const over = new Map(s.overrides.filter((o) => o.date >= s.startOn && o.date <= end).map((o) => [o.date, o.customWorkoutId]));
  const out: OwnScheduleDay[] = [];
  let k = 0;
  for (const date of dateRange(s.startOn, end)) {
    const base = days.has(weekdayOf(date)) ? (s.rotation[k++ % s.rotation.length] as string) : undefined;
    if (over.has(date)) out.push({ date, customWorkoutId: over.get(date) ?? null, changed: true });
    else if (base !== undefined) out.push({ date, customWorkoutId: base, changed: false });
  }
  return out;
}
