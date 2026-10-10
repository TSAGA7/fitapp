import { nearestToGrid, type Grid } from '../common/grid';

/**
 * Warm-up sets before the working ones: a short ramp of lighter weights so the joints and the nervous system are ready.
 * They are never counted as working sets: they do not move the progression, the volume or the records.
 */
export interface WarmupSet {
  weightKg: number;
  reps: number;
}

/** first: the first loaded exercise of the workout. later: another loaded exercise. repeat: its main muscle is already warm. */
export type WarmupPosition = 'first' | 'later' | 'repeat';

export function warmupSets(input: { workingKg: number; compound: boolean; position: WarmupPosition; grid: Grid }): WarmupSet[] {
  const w = input.workingKg;
  if (!(w > 0) || input.position === 'repeat') return [];
  let ramp: Array<[number, number]> = [];
  if (input.compound) {
    if (input.position === 'first') ramp = w >= 40 ? [[0.4, 8], [0.6, 5], [0.8, 3]] : w >= 20 ? [[0.5, 8], [0.75, 4]] : w >= 10 ? [[0.6, 8]] : [];
    else ramp = w >= 40 ? [[0.6, 5], [0.8, 3]] : w >= 20 ? [[0.7, 5]] : [];
  } else if (w >= 15) {
    ramp = [[0.6, 8]];
  }
  const out: WarmupSet[] = [];
  for (const [share, reps] of ramp) {
    let kg = nearestToGrid(w * share, input.grid);
    if (input.grid.minKg !== null) kg = Math.max(input.grid.minKg, kg);
    const prev = out[out.length - 1];
    if (kg <= 0 || kg >= w * 0.95 || (prev && kg <= prev.weightKg)) continue;
    out.push({ weightKg: kg, reps });
  }
  return out;
}
