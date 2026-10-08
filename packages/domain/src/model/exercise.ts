import { z } from 'zod';
import { entityBase } from './common';
import {
  BodyArea,
  LoadUnit,
  MovementPattern,
  MuscleGroup,
  ProgressionType,
  RangeOfMotion,
} from './enums';

const key = z.string().regex(/^[a-z0-9_]+$/, 'lowercase letters, digits and underscores only');
const level03 = z.number().int().min(0).max(3);

export const ExerciseVariant = z.object({
  key,
  label: z.string().min(1).max(120),
  note: z.string().max(300).nullable(),
});

/**
 * Exercise content. The tags are rough, non-medical estimates used to
 * filter and rank exercises; they are not a medical system.
 */
export const ExerciseDefinition = z.object({
  key,
  name: z.string().min(1).max(160),
  movementPattern: MovementPattern,
  primaryMuscles: z.array(MuscleGroup).min(1),
  secondaryMuscles: z.array(MuscleGroup),
  isCompound: z.boolean(),
  /** Load on each area, 0 (none) to 3 (high). Used for filtering. */
  jointStress: z.record(BodyArea, level03),
  /** Spinal compression from external load, 0-3. */
  axialLoad: level03,
  /** How much balance/bracing the movement demands, 0-3. */
  stabilityRequirement: level03,
  rangeOfMotion: RangeOfMotion,
  /** Where discomfort is commonly reported. Hints and warnings only, never a filter. */
  painSensitiveAreas: z.array(z.object({ area: BodyArea, note: z.string().min(1).max(300) })),
  /**
   * Any-of list of all-of sets: [["smith_machine"], ["barbell", "squat_rack"]]
   * means "Smith machine OR barbell with rack". An empty list = no equipment.
   */
  equipmentRequirements: z.array(z.array(key).min(1)),
  skillLevel: z.number().int().min(1).max(3),
  progressionType: ProgressionType,
  loadUnit: LoadUnit,
  defaultSets: z.number().int().min(1).max(8),
  defaultRepRange: z
    .object({ min: z.number().int().min(1), max: z.number().int().min(1) })
    .refine((r) => r.min <= r.max, 'min must be <= max'),
  defaultRestSec: z.number().int().min(0).max(600),
  cues: z.array(z.string().min(1).max(300)),
  /** Hand-picked safe replacements (exercise keys). Quality matters more than quantity. */
  curatedSubstituteKeys: z.array(key),
  /** Variants (angle, one/two dumbbells...) get separate progression history. */
  variants: z.array(ExerciseVariant),
});
export type ExerciseDefinition = z.infer<typeof ExerciseDefinition>;

export const Exercise = z.object({
  ...entityBase,
  ...ExerciseDefinition.shape,
  origin: z.enum(['seed', 'custom']),
});
export type Exercise = z.infer<typeof Exercise>;
