import { z } from 'zod';
import { entityBase, LocalDateSchema } from './common';

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
