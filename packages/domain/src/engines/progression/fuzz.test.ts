import { describe, expect, it } from 'vitest';
import { addDays } from '../../util/localDate';
import { nextPrescription } from './nextPrescription';
import type { NextPrescriptionInput, SessionResult, SetResult } from './types';

/** Deterministic pseudo-random generator (no Math.random in the project). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randomInput(rand: () => number): NextPrescriptionInput {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const step = pick([0, 1, 2.5, 5] as const);
  const weightOf = () => (step === 0 ? 0 : pick([4, 8, 12, 16, 20, 24, 32, 40]) * step);
  const weight = weightOf();
  const forDate = '2026-10-20';
  const count = Math.floor(rand() * 5);
  const history: SessionResult[] = [];
  let date = addDays(forDate, -Math.floor(rand() * 40));
  for (let i = 0; i < count; i++) {
    const planned = 3;
    const sets: SetResult[] = [];
    for (let n = 1; n <= planned; n++) {
      const roll = rand();
      const status = roll < 0.12 ? 'skipped' : roll < 0.18 ? 'failed' : 'done';
      sets.push({
        setNo: n,
        weightKg: rand() < 0.1 ? weightOf() : weight,
        reps: status === 'done' ? 3 + Math.floor(rand() * 12) : null,
        rir: status === 'done' ? (rand() < 0.1 ? null : Math.floor(rand() * 5)) : null,
        status,
        skipReason: status === 'done' ? null : pick(['could_not', 'no_time', 'fatigue', 'other', 'pain'] as const),
        painFlag: rand() < 0.07,
      });
    }
    history.push({
      date,
      kind: pick(['normal', 'normal', 'normal', 'calibration', 'deload'] as const),
      plannedSets: planned,
      repRange: { min: 8, max: 10 },
      repMaxTarget: pick([10, 10, 12] as const),
      rirTarget: { min: 2, max: 3 },
      sets,
      replaced: rand() < 0.05 ? { reason: pick(['machine_busy', 'discomfort', 'preference'] as const) } : null,
    });
    date = addDays(date, -(2 + Math.floor(rand() * 20)));
  }
  history.sort((a, b) => (a.date < b.date ? 1 : -1));
  return {
    forDate,
    plan: {
      repMin: 8,
      repMax: 10,
      rirTarget: { min: 2, max: 3 },
      sets: 3,
      restSec: 120,
      stepKg: step,
      minKg: rand() < 0.2 ? 0 : null,
      maxKg: rand() < 0.2 ? 100 * Math.max(step, 1) : null,
      startWeightKg: rand() < 0.2 ? null : weight,
    },
    exercise: { axialLoad: pick([0, 1, 2, 3] as const) },
    history,
    painEvents: rand() < 0.3 ? [{ date: addDays(forDate, -Math.floor(rand() * 35)), intensity: rand() < 0.5 ? null : Math.floor(rand() * 11) }] : [],
    adherence14d: rand() < 0.4 ? { planned: 1 + Math.floor(rand() * 5), done: Math.floor(rand() * 5) } : null,
    lastDeload: rand() < 0.2 ? { endedOn: addDays(forDate, -Math.floor(rand() * 30)), preDeloadWeightKg: rand() < 0.5 ? weight : null, reason: pick(['stall', 'fatigue', 'scheduled'] as const) } : null,
  };
}

describe('property checks over 1500 random inputs', () => {
  it('always returns a consistent, safe prescription', () => {
    const rand = lcg(20261001);
    for (let i = 0; i < 1500; i++) {
      const inp = randomInput(rand);
      const frozen = JSON.stringify(inp);
      const r = nextPrescription(inp);
      expect(JSON.stringify(inp)).toBe(frozen);

      expect(r.reasonText.length).toBeGreaterThan(10);
      expect(r.reasonText).not.toMatch(/undefined|NaN|null/);
      expect(r.rirTarget.min).toBeLessThanOrEqual(r.rirTarget.max);
      expect(r.rirTarget.max).toBeLessThanOrEqual(4);
      expect(r.repTarget.min).toBeLessThanOrEqual(r.repTarget.max);
      expect(r.restSec).toBeGreaterThanOrEqual(0);

      if (r.weightKg !== null) {
        expect(Number.isFinite(r.weightKg)).toBe(true);
        expect(r.weightKg).toBeGreaterThanOrEqual(0);
        const step = inp.plan.stepKg;
        if (step > 0) {
          const origin = inp.plan.minKg ?? 0;
          const k = (r.weightKg - origin) / step;
          expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
        }
        if (inp.plan.maxKg !== null) expect(r.weightKg).toBeLessThanOrEqual(inp.plan.maxKg + 1e-9);
        if (inp.plan.minKg !== null) expect(r.weightKg).toBeGreaterThanOrEqual(inp.plan.minKg - 1e-9);
      }
      // Pain at level 3+ always stops; an increase never happens with an open pain signal.
      if (r.trace.painLevel >= 3) expect(r.decision).toBe('stop');
      if (r.decision === 'increase') expect(r.trace.painLevel).toBe(0);
      if (r.decision === 'stop') expect(r.reasonCode.startsWith('pain_')).toBe(true);
      // An increase never lowers the weight and a decrease never raises it.
      if (r.deltaKg !== null && r.decision === 'increase') expect(r.deltaKg).toBeGreaterThanOrEqual(0);
      if (r.deltaKg !== null && r.decision === 'decrease') expect(r.deltaKg).toBeLessThanOrEqual(0);
      // The first run never invents a weight it was not given.
      if (inp.history.length === 0 && inp.plan.startWeightKg === null && r.trace.painLevel < 3) expect(r.weightKg).toBeNull();
    }
  });
});
