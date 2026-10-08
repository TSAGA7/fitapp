import { ceilDelta, clampToRange, floorDelta, floorToGrid, type Grid } from '../common/grid';
import { round6 } from '../common/stats';
import type { DecisionOutcome } from './decision';
import type { ProgressionParams } from './params';
import type { SignalSet } from './signals';
import type { NextPrescriptionInput } from './types';

export interface WeightResult {
  weightKg: number | null;
  weightIsEstimate: boolean;
  deltaKg: number | null;
}

/** Step 3 of the pipeline: turns the decided move into a weight on the equipment grid. */
export function calculateNextWeight(
  outcome: DecisionOutcome,
  sig: SignalSet,
  input: NextPrescriptionInput,
  params: ProgressionParams,
): WeightResult {
  const grid: Grid = { stepKg: input.plan.stepKg, minKg: input.plan.minKg, maxKg: input.plan.maxKg };
  const base = sig.baseWeightKg;
  const move = outcome.move;
  const result = (w: number | null, estimate = false): WeightResult => ({
    weightKg: w,
    weightIsEstimate: estimate,
    deltaKg: w !== null && base !== null ? round6(w - base) : null,
  });

  switch (move.kind) {
    case 'choose':
      return { weightKg: null, weightIsEstimate: false, deltaKg: null };
    case 'none':
      return result(base);
    case 'set': {
      const w = clampToRange(floorToGrid(Math.max(0, move.weightKg), grid), grid);
      return result(w, move.estimate);
    }
    case 'up': {
      if (base === null || grid.stepKg <= 0) return result(base);
      let kg = move.steps * grid.stepKg;
      if (move.steps >= 2) {
        kg = Math.min(kg, Math.max(grid.stepKg, floorDelta(base * params.confidentMaxFraction, grid.stepKg)));
      }
      let w = base + kg;
      if (move.capKg !== null) w = Math.max(base, Math.min(w, move.capKg));
      return result(clampToRange(round6(w), grid));
    }
    case 'down': {
      if (base === null || grid.stepKg <= 0) return result(base);
      const kg = Math.max(move.steps * grid.stepKg, ceilDelta(base * move.minFraction, grid.stepKg));
      return result(clampToRange(floorToGrid(base - kg, grid), grid));
    }
  }
}
