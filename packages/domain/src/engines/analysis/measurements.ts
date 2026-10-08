import type { BodyMetric, MetricType } from '../../model';
import type { LocalDate } from '../../util/localDate';

export interface MetricPoint {
  date: LocalDate;
  value: number;
}

/** Measurement history by type: one value per day (the last entered), oldest first, no deleted records. */
export function toMetricSeries(metrics: readonly BodyMetric[]): Partial<Record<MetricType, MetricPoint[]>> {
  const byKey = new Map<string, BodyMetric>();
  for (const m of metrics) {
    if (m.deletedAt !== null) continue;
    const key = `${m.type}|${m.measuredOn}`;
    const cur = byKey.get(key);
    if (!cur || m.createdAt > cur.createdAt) byKey.set(key, m);
  }
  const out: Partial<Record<MetricType, MetricPoint[]>> = {};
  for (const m of byKey.values()) (out[m.type] ??= []).push({ date: m.measuredOn, value: m.value });
  for (const list of Object.values(out)) list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

export interface MetricSummary {
  count: number;
  latest: MetricPoint | null;
  previous: MetricPoint | null;
  first: MetricPoint | null;
  deltaPrevious: number | null;
  deltaFirst: number | null;
}

export function summarizeSeries(points: readonly MetricPoint[] | undefined): MetricSummary {
  const list = points ?? [];
  const latest = list[list.length - 1] ?? null;
  const previous = list.length >= 2 ? (list[list.length - 2] as MetricPoint) : null;
  const first = list[0] ?? null;
  return {
    count: list.length,
    latest,
    previous,
    first,
    deltaPrevious: latest && previous ? round1(latest.value - previous.value) : null,
    deltaFirst: latest && first && list.length >= 2 ? round1(latest.value - first.value) : null,
  };
}

const round1 = (x: number): number => Math.round(x * 10) / 10;
