import type { ReplacementReason, SkipReason } from '../../model';
import type { LocalDate } from '../../util/localDate';

export interface RirTarget {
  min: number;
  max: number;
}
export interface RepRange {
  min: number;
  max: number;
}

/** One WORKING set of a finished session (warm-ups are filtered out by the caller). */
export interface SetResult {
  setNo: number;
  weightKg: number | null;
  reps: number | null;
  /** 0-4, where 4 means "4 or more". */
  rir: number | null;
  status: 'done' | 'skipped' | 'failed';
  skipReason: SkipReason | null;
  painFlag: boolean;
}

export type SessionKind = 'normal' | 'calibration' | 'deload';

/** What was planned and done for ONE progressionKey in ONE session. */
export interface SessionResult {
  date: LocalDate;
  kind: SessionKind;
  plannedSets: number;
  repRange: RepRange;
  /** Upper target that was prescribed (above repRange.max while reps are being extended). */
  repMaxTarget: number;
  rirTarget: RirTarget;
  sets: SetResult[];
  /** Set when the exercise was swapped for another one during that session. */
  replaced: { reason: ReplacementReason } | null;
}

export interface PainEventRef {
  date: LocalDate;
  /** 0-10, null when not stated. */
  intensity: number | null;
}

export interface PrescriptionPlan {
  repMin: number;
  repMax: number;
  rirTarget: RirTarget;
  sets: number;
  restSec: number;
  /** 0 = no external load (rep/time progression only). */
  stepKg: number;
  minKg: number | null;
  maxKg: number | null;
  startWeightKg: number | null;
}

export interface NextPrescriptionInput {
  /** Date of the upcoming session. */
  forDate: LocalDate;
  plan: PrescriptionPlan;
  exercise: { axialLoad: 0 | 1 | 2 | 3 };
  /** Sessions of THIS progressionKey, newest first (the engine looks at up to four). */
  history: SessionResult[];
  /** Pain events of this exerciseId (any variant), not only of this key. */
  painEvents: PainEventRef[];
  /** Planned vs done workouts over the last 14 days; null if unknown. */
  adherence14d: { planned: number; done: number } | null;
  lastDeload: {
    endedOn: LocalDate;
    preDeloadWeightKg: number | null;
    reason: 'stall' | 'fatigue' | 'scheduled';
  } | null;
}

export type Decision =
  | 'increase'
  | 'hold'
  | 'decrease'
  | 'extend_reps'
  | 'no_change'
  | 'calibrate'
  | 'resume'
  | 'stop';

export type ReasonCode =
  | 'pain_severe'
  | 'pain_repeated_stop'
  | 'pain_repeated'
  | 'pain_revert'
  | 'pain_hold'
  | 'layoff_one_step'
  | 'layoff_percent'
  | 'layoff_calibrate'
  | 'deload_resume'
  | 'low_adherence_hold'
  | 'replaced_in_last_session'
  | 'first_execution'
  | 'first_execution_choose_weight'
  | 'insufficient_data'
  | 'partial_no_time'
  | 'partial_fatigue'
  | 'partial_could_not'
  | 'partial_repeated_failure'
  | 'calibration_decrease'
  | 'calibration_hold'
  | 'calibration_increase'
  | 'rir_missing'
  | 'too_heavy_bad_day'
  | 'too_heavy_decrease'
  | 'near_failure_hold'
  | 'near_failure_decrease'
  | 'sharp_drop_hold'
  | 'sharp_drop_repeated'
  | 'top_reached_increase'
  | 'top_reached_increase_strong'
  | 'top_reached_rir_low'
  | 'top_reached_confirm_pending'
  | 'top_reached_extend'
  | 'top_reached_no_load_progress'
  | 'easy_increase'
  | 'easy_confirm_pending'
  | 'hold_build_reps'
  | 'hold_below_range';

export type SignalCode =
  | 'pain'
  | 'pain_severe'
  | 'fatigue'
  | 'stall'
  | 'layoff'
  | 'low_adherence'
  | 'confirm_pending'
  | 'near_failure'
  | 'sharp_drop'
  | 'rir_missing'
  | 'replaced'
  | 'after_deload'
  | 'calibration';

export interface Signal {
  code: SignalCode;
  severity: 'info' | 'warning' | 'critical';
  text: string;
}

export type SuggestionKind =
  | 'replace_exercise'
  | 'change_rep_range'
  | 'add_rest'
  | 'reduce_weight'
  | 'add_load'
  | 'seek_medical_evaluation'
  | 'choose_weight'
  | 'consider_deload';

export interface Suggestion {
  kind: SuggestionKind;
  text: string;
}

export interface PrescriptionTrace {
  workingWeightKg: number | null;
  repsText: string | null;
  rirText: string | null;
  daysSinceLast: number | null;
  painLevel: number;
  goodStreak: number;
  requiredStreak: number;
  confirmReasons: string[];
  stepKg: number;
}

export interface NextPrescription {
  decision: Decision;
  reasonCode: ReasonCode;
  /** Human-readable explanation with the numbers behind the decision. */
  reasonText: string;
  weightKg: number | null;
  /** True when the weight is an estimate that the first sets must confirm. */
  weightIsEstimate: boolean;
  deltaKg: number | null;
  repTarget: RepRange;
  rirTarget: RirTarget;
  sets: number;
  restSec: number;
  signals: Signal[];
  suggestions: Suggestion[];
  trace: PrescriptionTrace;
}
