import type {
  DailyLog,
  Exercise,
  Food,
  FoodLog,
  BodyMetric,
  MovementPattern,
  MuscleGroup,
  LoadUnit,
  SessionExercise,
  SetLog,
  WorkoutSession,
} from '../model';
import type { IdGenerator } from '../ports';

export type RawCell = string | number | boolean | Date | null | undefined;
export interface RawSheet {
  name: string;
  rows: RawCell[][];
}
export interface RawWorkbook {
  sheets: RawSheet[];
}

export type SheetKind = 'training' | 'nutrition' | 'unrecognized';

export interface SheetReport {
  name: string;
  kind: SheetKind;
  /** 1-based number of the header row. */
  headerRow: number | null;
  /** Field -> header text found in the file. */
  columns: Record<string, string> | null;
  rowsTotal: number;
  rowsBlank: number;
  rowsAccepted: number;
  rowsRejected: number;
  note: string | null;
}

/** A row (or a part of a row) that was NOT imported, shown separately from the accepted data. */
export interface RejectedRow {
  sheet: string;
  /** 1-based row number in the Excel sheet. */
  rowNumber: number;
  part: 'training' | 'nutrition' | 'weight' | 'water';
  category: 'invalid' | 'duplicate' | 'unmapped';
  reasons: string[];
  values: string[];
}

export type ExerciseDecision = { kind: 'use'; exerciseId: string } | { kind: 'create' } | { kind: 'skip' };

export interface ExerciseRef {
  id: string;
  key: string;
  name: string;
  origin: 'seed' | 'custom';
  defaultRepRange: { min: number; max: number };
}

export interface InferredExercise {
  movementPattern: MovementPattern;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  isCompound: boolean;
  loadUnit: LoadUnit;
}

export interface ExerciseResolution {
  sourceName: string;
  /** Key for decisions (normalized name). */
  normalized: string;
  rowCount: number;
  resolved: { exerciseId: string; name: string; via: 'name' | 'alias' | 'existing' } | null;
  inferred: InferredExercise | null;
  suggestions: Array<{ exerciseId: string; name: string }>;
  decision: ExerciseDecision;
  /** True when the decision is the default one, not chosen by the user. */
  decisionIsDefault: boolean;
}

export interface ExcelImportBundle {
  exercises: Exercise[];
  foods: Food[];
  workoutSessions: WorkoutSession[];
  sessionExercises: SessionExercise[];
  setLogs: SetLog[];
  bodyMetrics: BodyMetric[];
  foodLogs: FoodLog[];
  dailyLogs: DailyLog[];
}

export interface ExcelImportCounts {
  workoutSessions: number;
  sessionExercises: number;
  setLogs: number;
  setLogsWithoutRir: number;
  customExercises: number;
  bodyMetrics: number;
  foodLogs: number;
  dailyLogs: number;
}

export interface ExcelNormalizeContext {
  now: string;
  deviceId: string;
  ids: IdGenerator;
  /** Catalog and existing custom exercises. */
  exercises: readonly ExerciseRef[];
  /** True when the placeholder food for daily totals already exists. */
  hasDailyTotalFood: boolean;
  /** Decisions by normalized exercise name. */
  decisions?: Record<string, ExerciseDecision>;
}

export interface ExcelNormalization {
  sheets: SheetReport[];
  rejected: RejectedRow[];
  exerciseResolutions: ExerciseResolution[];
  bundle: ExcelImportBundle;
  counts: ExcelImportCounts;
  dateRange: { from: string; to: string } | null;
  warnings: string[];
}

/** Placeholder food that carries day totals (kcal/macros) imported from a summary sheet. */
export const DAILY_TOTAL_FOOD_ID = 'imported_daily_total';
