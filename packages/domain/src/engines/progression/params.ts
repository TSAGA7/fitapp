/**
 * Every threshold of the progression algorithm lives here and nowhere else.
 * The values are the ones approved for V1.0.
 */
export interface LayoffBand {
  fromDays: number;
  toDays: number;
  /** Reduction as a number of steps, or as a share of the weight. */
  reduction: { kind: 'steps'; steps: number } | { kind: 'fraction'; fraction: number };
  /** After a long break a calibration session replaces the normal flow. */
  calibrate: boolean;
}

export interface ProgressionParams {
  /** Fewer finished working sets than this: no decision (not enough data). */
  minWorkingSets: number;
  /** Sharp drop between the first and the last set: share and absolute reps. */
  sharpDropFraction: number;
  sharpDropMinReps: number;
  /** "Confident" increase: number of steps, capped by a share of the weight. */
  confidentSteps: number;
  confidentMaxFraction: number;
  /** One step above this share of the weight: add reps first (extend_reps). */
  bigStepFraction: number;
  extendRepsMax: number;
  /** A decrease is at least this share of the weight (and at least one step). */
  decreaseMinFraction: number;
  /** Counted sessions at the same weight without progress = stall. */
  stallSessions: number;
  /** axialLoad at or above this needs two consecutive good sessions to raise the weight. */
  confirmFromAxialLoad: number;
  confirmSessions: number;
  /** A gap longer than this between sessions breaks a confirmation streak. */
  gapResetDays: number;
  layoffBands: LayoffBand[];
  adherenceMinShare: number;
  adherenceMinPlanned: number;
  painWindowDays: number;
  /** Pain at or above this intensity (0-10) is a stop signal on its own. */
  severePainIntensity: number;
  painStopCount: number;
  calibrationRirBump: number;
  calibrationRirFloor: number;
  tooHeavyRestDeltaSec: number;
  sharpDropRestDeltaSec: number;
  /** Epley-style divisor for estimatedMax. */
  estimatedMaxDivisor: number;
  /** Starting-point offer when the equipment changes (never applied automatically). */
  equipmentTransferFactor: number;
  deload: {
    weightFactor: number;
    setsReduction: number;
    minSets: number;
    rirFloor: number;
    /** Exercises with fatigue/stall in the last two workouts that justify a suggestion. */
    exerciseCount: number;
    /** Continuous load that, together with a detected stall, justifies a suggestion. */
    longLoadWeeks: number;
    weeks: number;
  };
}

export const DEFAULT_PROGRESSION_PARAMS: ProgressionParams = {
  minWorkingSets: 2,
  sharpDropFraction: 0.3,
  sharpDropMinReps: 3,
  confidentSteps: 2,
  confidentMaxFraction: 0.15,
  bigStepFraction: 0.1,
  extendRepsMax: 2,
  decreaseMinFraction: 0.05,
  stallSessions: 3,
  confirmFromAxialLoad: 2,
  confirmSessions: 2,
  gapResetDays: 14,
  layoffBands: [
    { fromDays: 15, toDays: 21, reduction: { kind: 'steps', steps: 1 }, calibrate: false },
    { fromDays: 22, toDays: 35, reduction: { kind: 'fraction', fraction: 0.05 }, calibrate: false },
    { fromDays: 36, toDays: 60, reduction: { kind: 'fraction', fraction: 0.1 }, calibrate: false },
    { fromDays: 61, toDays: Number.POSITIVE_INFINITY, reduction: { kind: 'fraction', fraction: 0.15 }, calibrate: true },
  ],
  adherenceMinShare: 0.5,
  adherenceMinPlanned: 2,
  painWindowDays: 28,
  severePainIntensity: 7,
  painStopCount: 3,
  calibrationRirBump: 1,
  calibrationRirFloor: 3,
  tooHeavyRestDeltaSec: 30,
  sharpDropRestDeltaSec: 45,
  estimatedMaxDivisor: 30,
  equipmentTransferFactor: 0.85,
  deload: {
    weightFactor: 0.9,
    setsReduction: 1,
    minSets: 2,
    rirFloor: 3,
    exerciseCount: 2,
    longLoadWeeks: 8,
    weeks: 1,
  },
};
