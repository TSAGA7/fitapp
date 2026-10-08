import type { Exercise, PlannedExercise, WorkoutTemplate } from '../../model';
import { assessExercise, type SafetyContext } from './safety';

/** Slots of the "own bodyweight" workout (business trips, home): the first available exercise of each list wins. */
const BODYWEIGHT_SLOTS: readonly (readonly string[])[] = [
  ['vacuum_lying', 'vacuum_standing', 'breathing_90_90'],
  ['bodyweight_squat', 'wall_sit'],
  ['pushup', 'incline_pushup', 'knee_pushup'],
  ['reverse_lunge_bw', 'split_squat_bw'],
  ['glute_bridge_bw', 'single_leg_glute_bridge'],
  ['pike_pushup', 'prone_y_raise'],
  ['dead_bug', 'heel_slide'],
  ['plank', 'side_plank', 'hollow_hold'],
];

const FLOOR_ONLY = new Set(['floor_mat']);
/** Needs nothing but the floor (a mat counts as the floor). */
export const isBodyweightOnly = (ex: Pick<Exercise, 'equipmentRequirements'>): boolean =>
  ex.equipmentRequirements.length === 0 || ex.equipmentRequirements.some((g) => g.every((k) => FLOOR_ONLY.has(k)));

export interface BodyweightWorkoutInput {
  exercises: readonly Exercise[];
  ctx: SafetyContext;
  /** Extra exercises the user wants in the workout, appended at the end. */
}

/**
 * A ready workout without any equipment. Safety rules and the user's likes/dislikes still apply;
 * deterministic for the same input.
 */
export function buildBodyweightWorkout(input: BodyweightWorkoutInput): WorkoutTemplate {
  const ctx: SafetyContext = { ...input.ctx, availableEquipment: new Set(['floor_mat']) };
  const pool = input.exercises.filter((e) => e.deletedAt === null && isBodyweightOnly(e));
  const used = new Set<string>();
  const exercises: PlannedExercise[] = [];
  for (const keys of BODYWEIGHT_SLOTS) {
    const pick = keys
      .map((k) => pool.find((e) => e.key === k))
      .filter((e): e is Exercise => !!e && !used.has(e.id) && !ctx.disliked?.has(e.id))
      .map((e) => ({ e, a: assessExercise(e, ctx) }))
      .find((x) => x.a.status !== 'avoid' && x.a.status !== 'unavailable');
    if (!pick) continue;
    const ex = pick.e;
    used.add(ex.id);
    const activation = keys[0] === 'vacuum_lying';
    exercises.push({
      key: `bw_${exercises.length + 1}_${ex.key}`,
      exerciseId: ex.id,
      variantKey: 'default',
      position: exercises.length + 1,
      sets: activation ? 2 : Math.min(ex.defaultSets, 3),
      repMin: ex.defaultRepRange.min,
      repMax: ex.defaultRepRange.max,
      rirAdaptation: { min: 2, max: 3 },
      rirMain: { min: 1, max: 2 },
      restSec: Math.min(ex.defaultRestSec, 60),
      startWeightKg: null,
      progression: { type: ex.progressionType, stepKg: null },
    });
  }
  return { key: 'bodyweight', label: 'Со своим весом', focus: [], exercises };
}
