import { z } from 'zod';

/** Codes are stored in the database; display strings live in the UI (i18n). */
export const Sex = z.enum(['male', 'female', 'unspecified']);
export const UnitSystem = z.enum(['metric']);
export const Experience = z.enum(['beginner', 'intermediate', 'advanced']);
export const JobActivity = z.enum(['sedentary', 'light', 'moderate', 'heavy']);

export const GoalType = z.enum([
  'fat_loss',
  'recomposition',
  'muscle_gain',
  'muscle_retention',
  'strength',
  'functional_fitness',
]);
export const FocusArea = z.enum([
  'abdomen',
  'lower_abdomen',
  'shoulders',
  'back',
  'chest',
  'legs',
  'arms',
  'glutes',
]);
export const GoalStatus = z.enum(['active', 'achieved', 'archived']);

export const MetricType = z.enum([
  'weight',
  'body_fat',
  'chest',
  'waist',
  'hips',
  'neck',
  'shoulders',
  'biceps_left',
  'biceps_right',
  'thigh_left',
  'thigh_right',
  'calf_left',
  'calf_right',
]);
export const MetricUnit = z.enum(['kg', 'cm', 'percent']);

export const BodyArea = z.enum([
  'shoulder',
  'elbow',
  'wrist',
  'neck',
  'upper_back',
  'lower_back',
  'hip',
  'knee',
  'ankle',
  'other',
]);
export const Side = z.enum(['left', 'right', 'both']);
export const InjuryStatus = z.enum(['past', 'recurring', 'active']);
export const TriggerKind = z.enum(['exercise', 'movement', 'position', 'other']);

export const MuscleGroup = z.enum([
  'chest',
  'lats',
  'upper_back',
  'lower_back',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'adductors',
  'calves',
  'abs',
  'obliques',
]);
export const MovementPattern = z.enum([
  'squat',
  'hinge',
  'lunge',
  'knee_extension',
  'knee_flexion',
  'hip_extension',
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'chest_fly',
  'lateral_raise',
  'rear_delt_fly',
  'elbow_flexion',
  'elbow_extension',
  'calf_raise',
  'core_antiextension',
  'core_antirotation',
  'core_flexion',
  'carry',
]);
export const RangeOfMotion = z.enum(['short', 'medium', 'full', 'deep_stretch']);
export const ProgressionType = z.enum(['double', 'rep_only', 'time']);
export const LoadUnit = z.enum(['kg_total', 'kg_per_hand', 'kg_stack', 'bodyweight', 'seconds']);

export const EquipmentCategory = z.enum([
  'free_weights',
  'machines',
  'cable',
  'benches_racks',
  'bodyweight',
  'cardio',
  'accessories',
]);
export const EquipmentLoadType = z.enum(['plates', 'stack', 'dumbbell', 'bodyweight', 'band', 'none']);

export const FoodBasis = z.enum(['raw', 'cooked', 'as_sold']);
export const FoodCategory = z.enum([
  'meat',
  'poultry',
  'fish',
  'eggs',
  'dairy',
  'grains',
  'legumes',
  'vegetables',
  'fruits',
  'nuts_seeds',
  'fats_oils',
  'bread_bakery',
  'sweets',
  'drinks',
  'supplements',
  'ready_meals',
  'other',
]);
export const FoodUnit = z.enum(['g', 'ml', 'piece']);
export const FoodDataSourceKind = z.enum(['reference', 'user', 'label', 'estimate']);
export const Preference = z.enum(['love', 'like', 'ok', 'avoid']);
export const Availability = z.enum(['always', 'often', 'sometimes', 'rare']);
export const MealSlot = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export const FoodLogEntryType = z.enum(['as_planned', 'modified', 'unplanned', 'skipped_planned']);
export const MealPlanStatus = z.enum(['draft', 'active', 'archived']);

export const SetType = z.enum(['warmup', 'working', 'drop']);
export const SetStatus = z.enum(['done', 'skipped', 'failed']);
export const SkipReason = z.enum(['could_not', 'no_time', 'fatigue', 'pain', 'other']);
export const ReplacementReason = z.enum([
  'machine_busy',
  'equipment_unavailable',
  'discomfort',
  'preference',
]);
export const SessionStatus = z.enum(['in_progress', 'completed', 'abandoned']);
export const SessionExerciseStatus = z.enum(['planned', 'done', 'partial', 'skipped']);
export const PlannedSessionStatus = z.enum(['planned', 'done', 'skipped', 'moved']);

export const VersionSource = z.enum(['initial', 'engine', 'user', 'ai']);
export const ProposalKind = z.enum(['nutrition_targets', 'training_plan_edit']);
export const ProposalOrigin = z.enum(['engine', 'user', 'ai']);
export const ProposalStatus = z.enum(['draft', 'accepted', 'rejected', 'expired']);

export type Sex = z.infer<typeof Sex>;
export type Experience = z.infer<typeof Experience>;
export type JobActivity = z.infer<typeof JobActivity>;
export type GoalType = z.infer<typeof GoalType>;
export type FocusArea = z.infer<typeof FocusArea>;
export type MetricType = z.infer<typeof MetricType>;
export type MetricUnit = z.infer<typeof MetricUnit>;
export type BodyArea = z.infer<typeof BodyArea>;
export type Side = z.infer<typeof Side>;
export type InjuryStatus = z.infer<typeof InjuryStatus>;
export type MuscleGroup = z.infer<typeof MuscleGroup>;
export type MovementPattern = z.infer<typeof MovementPattern>;
export type RangeOfMotion = z.infer<typeof RangeOfMotion>;
export type ProgressionType = z.infer<typeof ProgressionType>;
export type LoadUnit = z.infer<typeof LoadUnit>;
export type FoodBasis = z.infer<typeof FoodBasis>;
export type FoodCategory = z.infer<typeof FoodCategory>;
export type MealSlot = z.infer<typeof MealSlot>;
export type SetType = z.infer<typeof SetType>;
export type SetStatus = z.infer<typeof SetStatus>;
export type SkipReason = z.infer<typeof SkipReason>;
export type ReplacementReason = z.infer<typeof ReplacementReason>;
export type Preference = z.infer<typeof Preference>;
export type Availability = z.infer<typeof Availability>;
export type VersionSource = z.infer<typeof VersionSource>;
export type SessionStatus = z.infer<typeof SessionStatus>;
export type PlannedSessionStatus = z.infer<typeof PlannedSessionStatus>;
export type SessionExerciseStatus = z.infer<typeof SessionExerciseStatus>;
export type FoodLogEntryType = z.infer<typeof FoodLogEntryType>;
export type MealPlanStatus = z.infer<typeof MealPlanStatus>;
export type TriggerKind = z.infer<typeof TriggerKind>;
