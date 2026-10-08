import { floorToGrid, clampToRange, type Grid } from '../common/grid';
import { round6 } from '../common/stats';
import { DEFAULT_PROGRESSION_PARAMS } from './params';
import type { RepRange, RirTarget } from './types';

/**
 * Estimated equivalent maximum with the reserve taken into account
 * (weight x (1 + (reps + RIR) / 30)). It is an ESTIMATE, not a measured 1RM,
 * and is used only to carry a weight over to another rep range.
 */
export function estimatedMaxKg(
  weightKg: number,
  reps: number,
  rir: number,
  divisor: number = DEFAULT_PROGRESSION_PARAMS.estimatedMaxDivisor,
): number {
  return round6(weightKg * (1 + (reps + rir) / divisor));
}

/** Starting weight for a NEW rep range, from the best set of the old range (rounded down to the grid). */
export function estimateStartWeightForRange(args: {
  bestSet: { weightKg: number; reps: number; rir: number };
  newRange: RepRange;
  targetRir: RirTarget;
  grid: Grid;
  divisor?: number;
}): number {
  const divisor = args.divisor ?? DEFAULT_PROGRESSION_PARAMS.estimatedMaxDivisor;
  const max = estimatedMaxKg(args.bestSet.weightKg, args.bestSet.reps, args.bestSet.rir, divisor);
  const midReps = (args.newRange.min + args.newRange.max) / 2;
  const raw = max / (1 + (midReps + args.targetRir.min) / divisor);
  return clampToRange(floorToGrid(raw, args.grid), args.grid);
}

/**
 * Offer when the equipment changes: the weight is NOT carried over automatically.
 * The user may accept this as a STARTING point (never as a confirmed working weight).
 */
export function suggestEquipmentTransfer(args: {
  lastWeightKg: number;
  grid: Grid;
  factor?: number;
}): { weightKg: number; factor: number; requiresUserConfirmation: true; isWorkingWeight: false } {
  const factor = args.factor ?? DEFAULT_PROGRESSION_PARAMS.equipmentTransferFactor;
  const w = clampToRange(floorToGrid(args.lastWeightKg * factor, args.grid), args.grid);
  return { weightKg: w, factor, requiresUserConfirmation: true, isWorkingWeight: false };
}

/** When the step changes the weight is kept; it is only rounded down if it does not exist on the new grid. */
export function adaptWeightToStep(weightKg: number, newGrid: Grid): number {
  return clampToRange(floorToGrid(weightKg, newGrid), newGrid);
}
