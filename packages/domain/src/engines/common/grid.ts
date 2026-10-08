import { round6 } from './stats';

/** Weights that exist on a piece of equipment: min, min+step, min+2*step ... up to max. */
export interface Grid {
  stepKg: number;
  minKg: number | null;
  maxKg: number | null;
}

const origin = (g: Grid): number => g.minKg ?? 0;

export function floorToGrid(value: number, g: Grid): number {
  if (g.stepKg <= 0) return round6(value);
  const o = origin(g);
  return round6(o + Math.floor((value - o) / g.stepKg + 1e-9) * g.stepKg);
}

export function ceilToGrid(value: number, g: Grid): number {
  if (g.stepKg <= 0) return round6(value);
  const o = origin(g);
  return round6(o + Math.ceil((value - o) / g.stepKg - 1e-9) * g.stepKg);
}

export function nearestToGrid(value: number, g: Grid): number {
  if (g.stepKg <= 0) return round6(value);
  const o = origin(g);
  return round6(o + Math.round((value - o) / g.stepKg) * g.stepKg);
}

/** Rounds a weight DIFFERENCE up to whole steps (a difference has no origin). */
export function ceilDelta(delta: number, stepKg: number): number {
  if (stepKg <= 0) return round6(delta);
  return round6(Math.ceil(delta / stepKg - 1e-9) * stepKg);
}

export function floorDelta(delta: number, stepKg: number): number {
  if (stepKg <= 0) return round6(delta);
  return round6(Math.floor(delta / stepKg + 1e-9) * stepKg);
}

export function clampToRange(value: number, g: Grid): number {
  let x = value;
  if (g.minKg !== null) x = Math.max(x, g.minKg);
  if (g.maxKg !== null) x = Math.min(x, g.maxKg);
  return round6(x);
}

export function sameWeight(a: number | null, b: number | null): boolean {
  return a !== null && b !== null && Math.abs(a - b) < 1e-6;
}
