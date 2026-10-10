import type { Exercise, PlannedExercise, WorkoutTemplate } from '../../model';
import { assessExercise, type SafetyContext } from './safety';

/**
 * Slots of the home / bodyweight workout: the first available exercise of each list wins. Exercises that need equipment come first,
 * so what the person has at home is used, and the plain bodyweight option is the fallback.
 */
const BODYWEIGHT_SLOTS: readonly (readonly string[])[] = [
  ['vacuum_lying', 'vacuum_standing', 'breathing_90_90'],
  ['goblet_squat_db', 'kettlebell_goblet_squat', 'band_squat', 'bodyweight_squat', 'sumo_squat_bw', 'wall_sit'],
  ['db_flat_press', 'pushup', 'band_chest_press', 'incline_pushup', 'knee_pushup'],
  ['pullup', 'one_arm_db_row_bench', 'band_row_seated', 'inverted_row_table'],
  ['reverse_lunge_db', 'reverse_lunge_bw', 'split_squat_bw', 'bulgarian_split_squat_bw'],
  ['rdl_db', 'band_rdl'],
  ['glute_bridge_bw', 'single_leg_glute_bridge', 'hip_thrust_bw'],
  ['db_shoulder_press_neutral', 'band_overhead_press', 'pike_pushup', 'prone_y_raise'],
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
  /** What the person has at home (equipment keys); the floor mat is always assumed. Empty = bodyweight only. */
  homeEquipment?: readonly string[];
}

/**
 * A ready workout without any equipment. Safety rules and the user's likes/dislikes still apply;
 * deterministic for the same input.
 */
export function buildBodyweightWorkout(input: BodyweightWorkoutInput): WorkoutTemplate {
  const ctx: SafetyContext = { ...input.ctx, availableEquipment: new Set(['floor_mat', ...(input.homeEquipment ?? [])]) };
  const pool = input.exercises.filter((e) => e.deletedAt === null);
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
  return { key: 'bodyweight', label: 'Дома', focus: [], exercises };
}
