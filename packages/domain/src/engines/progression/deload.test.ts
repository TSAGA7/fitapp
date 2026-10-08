import { describe, expect, it } from 'vitest';
import { buildDeloadPrescription, evaluateDeloadSuggestion } from './deload';

const base = {
  forDate: '2026-10-08',
  continuousLoadSince: '2026-09-01',
  recentWorkoutDates: ['2026-10-06', '2026-10-03'],
};

describe('evaluateDeloadSuggestion', () => {
  it('suggests when fatigue or stall appears in two exercises within the last two workouts', () => {
    const r = evaluateDeloadSuggestion({
      ...base,
      exercises: [
        { exerciseId: 'a', lastSessionDate: '2026-10-06', signals: ['fatigue'] },
        { exerciseId: 'b', lastSessionDate: '2026-10-03', signals: ['stall'] },
        { exerciseId: 'c', lastSessionDate: '2026-10-06', signals: [] },
      ],
    });
    expect(r.suggest).toBe(true);
    expect(r.triggers.map((t) => t.code)).toEqual(['several_exercises']);
    expect(r.exerciseIds).toEqual(['a', 'b']);
    expect(r.reasonText).toContain('2 упражнениях');
  });
  it('one exercise is not enough, and old sessions do not count', () => {
    expect(evaluateDeloadSuggestion({ ...base, exercises: [{ exerciseId: 'a', lastSessionDate: '2026-10-06', signals: ['fatigue'] }] }).suggest).toBe(false);
    const old = evaluateDeloadSuggestion({
      ...base,
      exercises: [
        { exerciseId: 'a', lastSessionDate: '2026-09-20', signals: ['fatigue'] },
        { exerciseId: 'b', lastSessionDate: '2026-09-21', signals: ['stall'] },
      ],
    });
    expect(old.suggest).toBe(false);
  });
  it('8 weeks of continuous load alone is not a reason; with a detected stall it is, and the reason names both', () => {
    const noStall = evaluateDeloadSuggestion({ ...base, continuousLoadSince: '2026-08-01', exercises: [{ exerciseId: 'a', lastSessionDate: '2026-10-06', signals: [] }] });
    expect(noStall.suggest).toBe(false);
    expect(noStall.reasonText).toBe('');
    const withStall = evaluateDeloadSuggestion({ ...base, continuousLoadSince: '2026-08-01', exercises: [{ exerciseId: 'a', lastSessionDate: '2026-09-20', signals: ['stall'] }] });
    expect(withStall.suggest).toBe(true);
    expect(withStall.triggers.map((t) => t.code)).toEqual(['long_load_with_stall']);
    expect(withStall.reasonText).toContain('нед. непрерывной нагрузки и обнаружен застой');
  });
  it('7 weeks with a stall is not yet enough', () => {
    const r = evaluateDeloadSuggestion({ ...base, continuousLoadSince: '2026-08-20', exercises: [{ exerciseId: 'a', lastSessionDate: '2026-10-06', signals: ['stall'] }] });
    expect(r.suggest).toBe(false);
  });
});

describe('buildDeloadPrescription', () => {
  const grid = { stepKg: 2.5, minKg: null, maxKg: null };
  it('weight x0.9 on the grid, one set less, RIR not below 3, one week', () => {
    const r = buildDeloadPrescription({ weightKg: 40, sets: 3, rirTarget: { min: 1, max: 2 }, grid });
    expect(r).toEqual({ weightKg: 35, sets: 2, rirTarget: { min: 3, max: 3 }, weeks: 1 });
  });
  it('keeps at least 2 sets and does not touch an unknown weight', () => {
    expect(buildDeloadPrescription({ weightKg: 42.5, sets: 2, rirTarget: { min: 2, max: 3 }, grid }).sets).toBe(2);
    expect(buildDeloadPrescription({ weightKg: null, sets: 4, rirTarget: { min: 2, max: 3 }, grid }).weightKg).toBeNull();
    expect(buildDeloadPrescription({ weightKg: 42.5, sets: 4, rirTarget: { min: 2, max: 3 }, grid }).weightKg).toBe(37.5);
  });
});
