import { describe, expect, it } from 'vitest';
import { progressionKey } from '../../util/progressionKey';
import type { Grid } from '../common/grid';
import { adaptWeightToStep, estimateStartWeightForRange, estimatedMaxKg, suggestEquipmentTransfer } from './estimatedMax';
import { nextPrescription } from './nextPrescription';
import { input, plan } from './testkit';

const grid: Grid = { stepKg: 2.5, minKg: null, maxKg: null };

describe('estimatedMax (an estimate, not a measured 1RM)', () => {
  it('40 kg x 10 at RIR 2 -> estimatedMax 56 kg', () => {
    expect(estimatedMaxKg(40, 10, 2)).toBe(56);
  });
});

describe('change of rep range', () => {
  it('is a new progressionKey with its own history', () => {
    const a = progressionKey({ exerciseId: 'leg_press', repMin: 8, repMax: 10 });
    const b = progressionKey({ exerciseId: 'leg_press', repMin: 12, repMax: 15 });
    expect(a).not.toBe(b);
  });
  it('carries the weight over through estimatedMax and rounds down to the grid', () => {
    const best = { weightKg: 40, reps: 10, rir: 2 };
    const heavy = estimateStartWeightForRange({ bestSet: best, newRange: { min: 6, max: 8 }, targetRir: { min: 2, max: 3 }, grid });
    const light = estimateStartWeightForRange({ bestSet: best, newRange: { min: 12, max: 15 }, targetRir: { min: 2, max: 3 }, grid });
    expect(heavy).toBe(42.5);
    expect(light).toBe(35);
  });
  it('the new range starts as a calibration session with that estimate', () => {
    const start = estimateStartWeightForRange({ bestSet: { weightKg: 40, reps: 10, rir: 2 }, newRange: { min: 6, max: 8 }, targetRir: { min: 2, max: 3 }, grid });
    const r = nextPrescription(input([], { plan: plan({ repMin: 6, repMax: 8, startWeightKg: start }) }));
    expect(r.reasonCode).toBe('first_execution');
    expect(r.weightKg).toBe(42.5);
    expect(r.weightIsEstimate).toBe(true);
  });
});

describe('change of equipment', () => {
  it('is a new progressionKey; the weight is not carried over automatically', () => {
    const a = progressionKey({ exerciseId: 'chest_press_machine_seated', repMin: 8, repMax: 10, equipmentId: 'machine_a' });
    const b = progressionKey({ exerciseId: 'chest_press_machine_seated', repMin: 8, repMax: 10, equipmentId: 'machine_b' });
    expect(a).not.toBe(b);
    const r = nextPrescription(input([], { plan: plan({ startWeightKg: null }) }));
    expect(r.weightKg).toBeNull();
  });
  it('offers 85% as a starting point only, and it needs the user to accept it', () => {
    const offer = suggestEquipmentTransfer({ lastWeightKg: 40, grid });
    expect(offer.factor).toBe(0.85);
    expect(offer.weightKg).toBe(32.5);
    expect(offer.requiresUserConfirmation).toBe(true);
    expect(offer.isWorkingWeight).toBe(false);
  });
});

describe('change of the weight step', () => {
  it('keeps the weight if it exists on the new grid, rounds down otherwise', () => {
    expect(adaptWeightToStep(40, { stepKg: 5, minKg: null, maxKg: null })).toBe(40);
    expect(adaptWeightToStep(42.5, { stepKg: 5, minKg: null, maxKg: null })).toBe(40);
    expect(adaptWeightToStep(13, { stepKg: 2, minKg: 2, maxKg: null })).toBe(12);
  });
  it('the next increase uses the new step', () => {
    const r = nextPrescription(input([], { plan: plan({ stepKg: 5, startWeightKg: 40 }) }));
    expect(r.weightKg).toBe(40);
  });
});
