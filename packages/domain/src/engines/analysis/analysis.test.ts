import { describe, expect, it } from 'vitest';
import type { BodyMetric } from '../../model';
import { ageYears } from '../../util/age';
import { addDays } from '../../util/localDate';
import { summarizeSeries, toMetricSeries } from './measurements';
import { strengthByExercise } from './strength';
import { analyzeWeight, movingAverage, toWeightPoints, windowMean } from './weight';

const metric = (id: string, type: BodyMetric['type'], value: number, measuredOn: string, createdAt = '2026-10-01T08:00:00+00:00', deletedAt: string | null = null): BodyMetric => ({
  id,
  createdAt,
  updatedAt: createdAt,
  deletedAt,
  deviceId: 'd',
  type,
  value,
  unit: type === 'weight' ? 'kg' : 'cm',
  measuredOn,
  note: null,
});
const pts = (start: string, kgs: number[]) => kgs.map((kg, i) => ({ date: addDays(start, i), kg }));

describe('weight points', () => {
  it('keeps one value per day (the last entered), skips other types and deleted records', () => {
    const p = toWeightPoints([
      metric('a', 'weight', 82, '2026-10-02', '2026-10-02T07:00:00+00:00'),
      metric('b', 'weight', 81.5, '2026-10-02', '2026-10-02T09:00:00+00:00'),
      metric('c', 'weight', 83, '2026-10-01'),
      metric('d', 'waist', 90, '2026-10-01'),
      metric('e', 'weight', 99, '2026-10-03', '2026-10-03T07:00:00+00:00', '2026-10-03T08:00:00+00:00'),
    ]);
    expect(p).toEqual([{ date: '2026-10-01', kg: 83 }, { date: '2026-10-02', kg: 81.5 }]);
  });
});

describe('windows and moving average', () => {
  const p = pts('2026-10-01', [80, 82, 84, 86]);
  it('means the points inside (end - days, end]', () => {
    expect(windowMean(p, '2026-10-04', 7)).toEqual({ mean: 83, count: 4 });
    expect(windowMean(p, '2026-10-04', 2)).toEqual({ mean: 85, count: 2 });
    expect(windowMean(p, '2026-09-01', 7)).toEqual({ mean: null, count: 0 });
  });
  it('moving average at every weigh-in', () => {
    expect(movingAverage(p, 7).map((x) => x.kg)).toEqual([80, 81, 82, 83]);
  });
});

describe('analyzeWeight', () => {
  it('is empty without data', () => {
    expect(analyzeWeight([])).toMatchObject({ count: 0, currentKg: null, avg7: null, rateKgPerWeek: null, rateReliable: false });
  });
  it('current value, 7 and 30 day averages are anchored at the latest weigh-in', () => {
    const p = pts('2026-09-01', Array.from({ length: 40 }, (_, i) => 84 - i * 0.1));
    const t = analyzeWeight(p);
    expect(t.asOf).toBe('2026-10-10');
    expect(t.currentKg).toBeCloseTo(80.1, 5);
    expect(t.avg7).toBeCloseTo(80.4, 5);
    expect(t.avg30).toBeCloseTo(81.55, 5);
  });
  it('week, month change and rate for a steady loss of 0.1 kg per day', () => {
    const t = analyzeWeight(pts('2026-09-01', Array.from({ length: 40 }, (_, i) => 84 - i * 0.1)));
    expect(t.weekChangeKg).toBeCloseTo(-0.7, 5);
    expect(t.monthChangeKg).toBeCloseTo(-3, 5);
    expect(t.rateKgPerWeek).toBeCloseTo(-0.7, 5);
    expect(t.rateReliable).toBe(true);
  });
  it('before 30 days of history the month change is empty and the change since the start is used', () => {
    const t = analyzeWeight(pts('2026-10-01', [83, 82.8, 82.9, 82.5, 82.4, 82.3, 82.2, 82.0, 81.9, 81.8]));
    expect(t.monthChangeKg).toBeNull();
    expect(t.sinceStartDays).toBe(9);
    expect(t.sinceStartKg).toBeCloseTo(82.157 - 82.586, 2);
  });
  it('a rate from few weigh-ins is marked unreliable', () => {
    const p = [...pts('2026-10-01', [83]), ...pts('2026-10-08', [82.5]), ...pts('2026-10-15', [82])];
    const t = analyzeWeight(p);
    expect(t.rateKgPerWeek).not.toBeNull();
    expect(t.rateReliable).toBe(false);
  });
  it('a single weigh-in has a current value but no trend', () => {
    const t = analyzeWeight([{ date: '2026-10-01', kg: 82.5 }]);
    expect(t).toMatchObject({ count: 1, currentKg: 82.5, avg7: 82.5, weekChangeKg: null, monthChangeKg: null, sinceStartKg: null });
  });
});

describe('measurements', () => {
  it('groups by type, one value per day, oldest first', () => {
    const s = toMetricSeries([
      metric('1', 'waist', 92, '2026-10-15'),
      metric('2', 'waist', 94, '2026-10-01'),
      metric('3', 'waist', 91.5, '2026-10-15', '2026-10-16T00:00:00+00:00'),
      metric('4', 'chest', 102, '2026-10-01'),
      metric('5', 'waist', 80, '2026-10-20', '2026-10-20T00:00:00+00:00', '2026-10-21T00:00:00+00:00'),
    ]);
    expect(s.waist).toEqual([{ date: '2026-10-01', value: 94 }, { date: '2026-10-15', value: 91.5 }]);
    expect(s.chest).toHaveLength(1);
    expect(s.hips).toBeUndefined();
  });
  it('summarizes the change from the previous and from the first value', () => {
    const s = summarizeSeries([{ date: '2026-10-01', value: 94 }, { date: '2026-10-15', value: 92 }, { date: '2026-11-01', value: 89 }]);
    expect(s).toMatchObject({ count: 3, deltaPrevious: -3, deltaFirst: -5 });
    expect(s.latest?.value).toBe(89);
    expect(summarizeSeries([{ date: '2026-10-01', value: 94 }])).toMatchObject({ deltaPrevious: null, deltaFirst: null, count: 1 });
    expect(summarizeSeries(undefined)).toMatchObject({ count: 0, latest: null });
  });
});

describe('strength', () => {
  const row = (exerciseId: string, date: string, weightKg: number | null, reps: number, setType: 'working' | 'warmup' | 'drop' = 'working') => ({ exerciseId, date, weightKg, reps, setType });
  it('takes the heaviest working weight of every day and the reps done with it', () => {
    const r = strengthByExercise([
      row('press', '2026-07-03', 40, 10),
      row('press', '2026-07-03', 40, 8),
      row('press', '2026-07-03', 20, 15, 'warmup'),
      row('press', '2026-07-23', 45, 8),
      row('press', '2026-07-23', 40, 10),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]?.sessions).toEqual([
      { date: '2026-07-03', topWeightKg: 40, repsAtTop: 10, sets: 2, totalReps: 18, volumeKg: 720 },
      { date: '2026-07-23', topWeightKg: 45, repsAtTop: 8, sets: 2, totalReps: 18, volumeKg: 760 },
    ]);
    expect(r[0]).toMatchObject({ firstTopWeightKg: 40, lastTopWeightKg: 45, deltaKg: 5, deltaPct: 12.5 });
  });
  it('ignores sets without a weight or reps, and sorts by the latest training', () => {
    const r = strengthByExercise([row('a', '2026-07-01', 30, 10), row('b', '2026-07-10', 20, 10), row('c', '2026-07-12', null, 10), row('d', '2026-07-12', 20, 0)]);
    expect(r.map((x) => x.exerciseId)).toEqual(['b', 'a']);
    expect(r[1]?.deltaPct).toBeNull();
  });
});

describe('ageYears', () => {
  it('counts full years; the birthday itself counts', () => {
    expect(ageYears('1997-05-12', '2026-05-11')).toBe(28);
    expect(ageYears('1997-05-12', '2026-05-12')).toBe(29);
    expect(ageYears('1997-05-12', '2026-10-06')).toBe(29);
    expect(() => ageYears('1997-02-31', '2026-10-06')).toThrow(RangeError);
  });
});
