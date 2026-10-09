import { z } from 'zod';
import { entityBase, LocalDateSchema, NutritionTargets, RirRange } from './common';
import { FocusArea, ProgressionType, VersionSource } from './enums';

const key = z.string().regex(/^[a-z0-9_]+$/, 'lowercase letters, digits and underscores only');

export const PlannedExercise = z.object({
  /** Stable within a version; sessions refer to the exercise by this key. */
  key,
  exerciseId: z.string().min(1),
  variantKey: z.string().min(1),
  position: z.number().int().min(1),
  sets: z.number().int().min(1).max(10),
  repMin: z.number().int().min(1),
  repMax: z.number().int().min(1),
  /** RIR targets: adaptation weeks first, main phase afterwards. */
  rirAdaptation: RirRange,
  rirMain: RirRange,
  restSec: z.number().int().min(0).max(600),
  startWeightKg: z.number().min(0).nullable(),
  progression: z.object({
    type: ProgressionType,
    /** null = use the step of the equipment. */
    stepKg: z.number().min(0).nullable(),
  }),
});
export type PlannedExercise = z.infer<typeof PlannedExercise>;

export const WorkoutTemplate = z.object({
  key,
  label: z.string().min(1).max(60),
  focus: z.array(FocusArea),
  exercises: z.array(PlannedExercise),
});
export type WorkoutTemplate = z.infer<typeof WorkoutTemplate>;

export const TrainingPlanSnapshot = z.object({
  workouts: z.array(WorkoutTemplate).min(1),
  /** Order of workouts for the training days of the week, e.g. A, B, C. */
  rotation: z.array(key).min(1),
  adaptationWeeks: z.number().int().min(0).max(12),
  startsOn: LocalDateSchema,
  /** The user asked to finish every workout with abdominal work (any goal). */
  absEveryWorkout: z.boolean().optional(),
});
export type TrainingPlanSnapshot = z.infer<typeof TrainingPlanSnapshot>;

export const Program = z.object({
  ...entityBase,
  activeVersionId: z.string().nullable(),
});
export type Program = z.infer<typeof Program>;

/**
 * IMMUTABLE snapshot of the whole plan (nutrition targets + training).
 * A change never edits a version: it creates the next one.
 */
export const ProgramVersion = z.object({
  ...entityBase,
  programId: z.string().min(1),
  versionNo: z.number().int().min(1),
  parentVersionId: z.string().nullable(),
  source: VersionSource,
  reasonSummary: z.string().min(1).max(500),
  effectiveFrom: LocalDateSchema,
  nutrition: NutritionTargets,
  training: TrainingPlanSnapshot,
});
export type ProgramVersion = z.infer<typeof ProgramVersion>;

export const DiffEntry = z.object({
  path: z.string().min(1),
  before: z.unknown(),
  after: z.unknown(),
});

/** A record of an ACCEPTED change between two versions (proposals hold the proposed ones). */
export const PlanChange = z.object({
  ...entityBase,
  fromVersionId: z.string().nullable(),
  toVersionId: z.string().min(1),
  kind: z.enum(['nutrition_targets', 'training_plan_edit', 'initial']),
  reasonCode: z.string().min(1),
  reasonText: z.string().min(1).max(500),
  /** The numbers the decision was based on. */
  evidence: z.record(z.string(), z.unknown()),
  diff: z.array(DiffEntry),
  source: VersionSource,
});
export type PlanChange = z.infer<typeof PlanChange>;
