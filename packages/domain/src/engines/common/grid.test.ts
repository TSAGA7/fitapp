import { describe, expect, it } from 'vitest';
import { ceilDelta, ceilToGrid, clampToRange, floorDelta, floorToGrid, nearestToGrid, sameWeight } from './grid';
import { median } from './stats';

const g = { stepKg: 2.5, minKg: null, maxKg: null };
describe('grid', () => {
  it('rounds to the equipment grid without floating point noise', () => {
    expect(floorToGrid(37.4, g)).toBe(35);
    expect(floorToGrid(37.5, g)).toBe(37.5);
    expect(ceilToGrid(37.6, g)).toBe(40);
    expect(nearestToGrid(36.2, g)).toBe(35);
    expect(floorToGrid(0.1 + 0.2 + 37.2, g)).toBe(37.5);
  });
  it('respects the minimum as the origin of the grid', () => {
    const d = { stepKg: 2, minKg: 3, maxKg: 13 };
    expect(floorToGrid(8, d)).toBe(7);
    expect(clampToRange(20, d)).toBe(13);
    expect(clampToRange(1, d)).toBe(3);
  });
  it('rounds differences to whole steps', () => {
    expect(ceilDelta(2, 2.5)).toBe(2.5);
    expect(ceilDelta(5, 2.5)).toBe(5);
    expect(floorDelta(4.5, 2.5)).toBe(2.5);
  });
  it('compares weights and computes medians', () => {
    expect(sameWeight(40, 40.0000001)).toBe(true);
    expect(sameWeight(null, 40)).toBe(false);
    expect(median([2, 1, 1])).toBe(1);
    expect(median([1, 2])).toBe(1.5);
    expect(median([])).toBeNull();
  });
});
