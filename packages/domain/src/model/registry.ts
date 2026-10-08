import type { ZodTypeAny } from 'zod';
import { BodyMetric } from './metrics';
import { DailyLog, FoodLog, MealPlan, PlannedItem } from './nutritionLog';
import { Equipment, UserEquipment } from './equipment';
import { Exercise, ExerciseNote, UserExercise } from './exercise';
import { Food, NutritionTargetsRecord, UserFood } from './food';
import { Goal } from './goals';
import { Injury, PainEvent } from './injuries';
import { ProgressPhoto, WeeklySummary } from './misc';
import { PlanChange, Program, ProgramVersion } from './program';
import { Profile } from './profile';
import { Proposal } from './proposal';
import {
  PlannedSession,
  PlannedSet,
  SessionExercise,
  SetLog,
  WorkoutSession,
} from './training';

/**
 * Every persistent store and its schema. Used by backup/restore and by the
 * Excel importer to validate records before anything is written.
 */
export const ENTITY_SCHEMAS = {
  profile: Profile,
  goals: Goal,
  bodyMetrics: BodyMetric,
  injuries: Injury,
  painEvents: PainEvent,
  equipment: Equipment,
  userEquipment: UserEquipment,
  exercises: Exercise,
  userExercises: UserExercise,
  exerciseNotes: ExerciseNote,
  foods: Food,
  userFoods: UserFood,
  nutritionTargets: NutritionTargetsRecord,
  mealPlans: MealPlan,
  plannedItems: PlannedItem,
  foodLogs: FoodLog,
  dailyLogs: DailyLog,
  programs: Program,
  programVersions: ProgramVersion,
  planChanges: PlanChange,
  proposals: Proposal,
  plannedSessions: PlannedSession,
  plannedSets: PlannedSet,
  workoutSessions: WorkoutSession,
  sessionExercises: SessionExercise,
  setLogs: SetLog,
  weeklySummaries: WeeklySummary,
  progressPhotos: ProgressPhoto,
} as const satisfies Record<string, ZodTypeAny>;

export type StoreName = keyof typeof ENTITY_SCHEMAS;
export const STORE_NAMES = Object.keys(ENTITY_SCHEMAS) as StoreName[];

/** Bump together with a Dexie migration. */
export const SCHEMA_VERSION = 2;
