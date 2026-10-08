import type { BodyMetric } from '../../model';
import { addDays, diffDays, type LocalDate } from '../../util/localDate';

export interface WeightPoint {
  date: LocalDate;
  kg: number;
}

/** One value per day: the entry that was made last wins; deleted records are ignored. */
export function toWeightPoints(metrics: readonly BodyMetric[]): WeightPoint[] {
  const byDay = new Map<string, BodyMetric>();
  for (const m of metrics) {
    if (m.type !== 'weight' || m.deletedAt !== null) continue;
    const current = byDay.get(m.measuredOn);
    if (!current || m.createdAt > current.createdAt) byDay.set(m.measuredOn, m);
  }
  return [...byDay.values()]
    .map((m) => ({ date: m.measuredOn, kg: m.value }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface WindowStat {
  mean: number | null;
  count: number;
}

/** Mean of the points inside (end - days, end]. */
export function windowMean(points: readonly WeightPoint[], end: LocalDate, days: number): WindowStat {
  const from = addDays(end, -days);
  const inside = points.filter((p) => p.date > from && p.date <= end);
  if (inside.length === 0) return { mean: null, count: 0 };
  return { mean: inside.reduce((a, p) => a + p.kg, 0) / inside.length, count: inside.length };
}

/** At every weigh-in: the mean of the last `days` days (the 7-day average of the tracker). */
export function movingAverage(points: readonly WeightPoint[], days = 7): WeightPoint[] {
  return points.map((p) => ({ date: p.date, kg: windowMean(points, p.date, days).mean as number }));
}

export interface WeightTrend {
  count: number;
  asOf: LocalDate | null;
  currentKg: number | null;
  avg7: number | null;
  avg30: number | null;
  /** avg7 now minus avg7 a week earlier. */
  weekChangeKg: number | null;
  /** avg7 now minus avg7 around 30 days earlier (null until there are 30 days of history). */
  monthChangeKg: number | null;
  /** avg7 now minus the mean of the first week of records, and how many days that spans. */
  sinceStartKg: number | null;
  sinceStartDays: number | null;
  /** kg per week, from two 7-day averages 14 days apart. */
  rateKgPerWeek: number | null;
  /** True when both windows behind the rate have enough weigh-ins. */
  rateReliable: boolean;
}

/**
 * The weight picture as in the tracker: judge the 7-day average, not a single weigh-in.
 * Windows are anchored at the latest weigh-in, not at the system date.
 */
export function analyzeWeight(points: readonly WeightPoint[], options: { minWeighIns?: number } = {}): WeightTrend {
  const minWeighIns = options.minWeighIns ?? 4;
  const empty: WeightTrend = {
    count: 0,
    asOf: null,
    currentKg: null,
    avg7: null,
    avg30: null,
    weekChangeKg: null,
    monthChangeKg: null,
    sinceStartKg: null,
    sinceStartDays: null,
    rateKgPerWeek: null,
    rateReliable: false,
  };
  if (points.length === 0) return empty;
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = sorted[sorted.length - 1] as WeightPoint;
  const first = sorted[0] as WeightPoint;
  const now = windowMean(sorted, last.date, 7);
  const diff = (endOffset: number): number | null => {
    const w = windowMean(sorted, addDays(last.date, -endOffset), 7);
    return now.mean !== null && w.mean !== null ? now.mean - w.mean : null;
  };
  const prev14 = windowMean(sorted, addDays(last.date, -14), 7);
  const firstWeek = windowMean(sorted, addDays(first.date, 6), 7);
  const sinceStartDays = diffDays(first.date, last.date);
  return {
    count: sorted.length,
    asOf: last.date,
    currentKg: last.kg,
    avg7: now.mean,
    avg30: windowMean(sorted, last.date, 30).mean,
    weekChangeKg: diff(7),
    monthChangeKg: diff(30),
    sinceStartKg: now.mean !== null && firstWeek.mean !== null && sinceStartDays >= 7 ? now.mean - firstWeek.mean : null,
    sinceStartDays: sinceStartDays >= 7 ? sinceStartDays : null,
    rateKgPerWeek: diff(14) === null ? null : (diff(14) as number) / 2,
    rateReliable: now.count >= minWeighIns && prev14.count >= minWeighIns,
  };
}
