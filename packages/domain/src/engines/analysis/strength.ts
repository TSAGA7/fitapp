import type { LocalDate } from '../../util/localDate';

export interface StrengthRow {
  exerciseId: string;
  date: LocalDate;
  weightKg: number | null;
  reps: number;
  setType: 'working' | 'warmup' | 'drop';
}

/**
 * Estimated one-rep max (Epley: weight x (1 + reps / 30)). An ESTIMATE from a submaximal set, not a tested max;
 * it is only trusted up to 12 repetitions, further it drifts upward.
 */
export const e1rmKg = (weightKg: number, reps: number): number => (reps <= 1 ? weightKg : Math.round(weightKg * (1 + reps / 30) * 10) / 10);
const E1RM_MAX_REPS = 12;

export interface StrengthSession {
  date: LocalDate;
  /** Best estimated one-rep max of the day. */
  e1rmKg: number;
  topWeightKg: number;
  repsAtTop: number;
  sets: number;
  totalReps: number;
  volumeKg: number;
}

export interface StrengthRecords {
  /** Best estimated max and the day it was reached. */
  e1rm: { kg: number; date: LocalDate };
  /** Heaviest weight lifted for at least one repetition, with the most reps at it. */
  weight: { kg: number; reps: number; date: LocalDate };
  /** The biggest total tonnage (weight x reps) in one workout. */
  volume: { kg: number; date: LocalDate };
  /** The newest workout set a new estimated-max record (and it is not the very first workout). */
  newOnLast: boolean;
}

export interface ExerciseStrength {
  exerciseId: string;
  records: StrengthRecords;
  firstE1rmKg: number;
  lastE1rmKg: number;
  e1rmDeltaPct: number | null;
  sessions: StrengthSession[];
  firstTopWeightKg: number;
  lastTopWeightKg: number;
  deltaKg: number;
  deltaPct: number | null;
}

/**
 * Strength history per exercise from finished working sets: for each day the heaviest weight and
 * the reps done with it. Most recently trained exercises come first.
 */
export function strengthByExercise(rows: readonly StrengthRow[]): ExerciseStrength[] {
  const days = new Map<string, Map<string, StrengthRow[]>>();
  for (const r of rows) {
    if (r.setType !== 'working' || r.weightKg === null || r.weightKg <= 0 || r.reps < 1) continue;
    const byDate = days.get(r.exerciseId) ?? new Map<string, StrengthRow[]>();
    days.set(r.exerciseId, byDate);
    byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  }
  const out: ExerciseStrength[] = [];
  for (const [exerciseId, byDate] of days) {
    const sessions: StrengthSession[] = [...byDate.entries()]
      .map(([date, sets]) => {
        const top = Math.max(...sets.map((s) => s.weightKg as number));
        const atTop = sets.filter((s) => s.weightKg === top);
        const reliable = sets.filter((x) => x.reps <= E1RM_MAX_REPS);
        const e1 = Math.max(...(reliable.length > 0 ? reliable : sets).map((x) => e1rmKg(x.weightKg as number, x.reps)));
        return {
          date,
          e1rmKg: e1,
          topWeightKg: top,
          repsAtTop: Math.max(...atTop.map((s) => s.reps)),
          sets: sets.length,
          totalReps: sets.reduce((a, s) => a + s.reps, 0),
          volumeKg: Math.round(sets.reduce((a, s) => a + (s.weightKg as number) * s.reps, 0) * 10) / 10,
        };
      })
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const first = (sessions[0] as StrengthSession).topWeightKg;
    const last = (sessions[sessions.length - 1] as StrengthSession).topWeightKg;
    const bestE1 = sessions.reduce((a, x) => (x.e1rmKg > a.e1rmKg ? x : a), sessions[0] as StrengthSession);
    const bestW = sessions.reduce((a, x) => (x.topWeightKg > a.topWeightKg || (x.topWeightKg === a.topWeightKg && x.repsAtTop > a.repsAtTop) ? x : a), sessions[0] as StrengthSession);
    const bestV = sessions.reduce((a, x) => (x.volumeKg > a.volumeKg ? x : a), sessions[0] as StrengthSession);
    const lastS = sessions[sessions.length - 1] as StrengthSession;
    const firstE = (sessions[0] as StrengthSession).e1rmKg;
    const prevBest = sessions.slice(0, -1).reduce((m, x) => Math.max(m, x.e1rmKg), 0);
    out.push({
      exerciseId,
      records: {
        e1rm: { kg: bestE1.e1rmKg, date: bestE1.date },
        weight: { kg: bestW.topWeightKg, reps: bestW.repsAtTop, date: bestW.date },
        volume: { kg: bestV.volumeKg, date: bestV.date },
        newOnLast: sessions.length >= 2 && lastS.e1rmKg > prevBest,
      },
      firstE1rmKg: firstE,
      lastE1rmKg: lastS.e1rmKg,
      e1rmDeltaPct: sessions.length >= 2 && firstE > 0 ? Math.round(((lastS.e1rmKg - firstE) / firstE) * 1000) / 10 : null,
      sessions,
      firstTopWeightKg: first,
      lastTopWeightKg: last,
      deltaKg: Math.round((last - first) * 10) / 10,
      deltaPct: sessions.length >= 2 && first > 0 ? Math.round(((last - first) / first) * 1000) / 10 : null,
    });
  }
  return out.sort((a, b) => {
    const la = (a.sessions[a.sessions.length - 1] as StrengthSession).date;
    const lb = (b.sessions[b.sessions.length - 1] as StrengthSession).date;
    return la < lb ? 1 : la > lb ? -1 : a.exerciseId.localeCompare(b.exerciseId);
  });
}

// ---------------------------------------------------------------- volume by muscle

export interface MuscleVolumeRow {
  exerciseId: string;
  date: LocalDate;
  setType: 'working' | 'warmup' | 'drop';
}

export type VolumeLevel = 'low' | 'some' | 'good' | 'high';

export interface MuscleVolume {
  muscle: string;
  /** Hard sets in the last 7 days: a set counts 1 for a primary muscle and 0.5 for a secondary one. */
  sets: number;
  /** The same for the 7 days before. */
  prevSets: number;
  level: VolumeLevel;
}

/** Weekly sets per muscle that are usually enough to grow: about 10 to 20 (a common guide from volume studies). */
export const VOLUME_BAND = { some: 6, good: 10, high: 21 } as const;

export function volumeLevel(sets: number): VolumeLevel {
  return sets < VOLUME_BAND.some ? 'low' : sets < VOLUME_BAND.good ? 'some' : sets < VOLUME_BAND.high ? 'good' : 'high';
}

/** Sets per muscle over the last week and the week before it, from finished working sets. Muscles with no work at all are left out. */
export function muscleVolume(rows: readonly MuscleVolumeRow[], muscles: (exerciseId: string) => { primary: readonly string[]; secondary: readonly string[] } | undefined, today: LocalDate): MuscleVolume[] {
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const t = day(today);
  const cur = new Map<string, number>();
  const prev = new Map<string, number>();
  for (const r of rows) {
    if (r.setType !== 'working') continue;
    const age = Math.floor((t - day(r.date)) / 86_400_000);
    if (age < 0 || age > 13) continue;
    const m = muscles(r.exerciseId);
    if (!m) continue;
    const bucket = age <= 6 ? cur : prev;
    for (const x of m.primary) bucket.set(x, (bucket.get(x) ?? 0) + 1);
    for (const x of m.secondary) bucket.set(x, (bucket.get(x) ?? 0) + 0.5);
  }
  const all = new Set([...cur.keys(), ...prev.keys()]);
  return [...all]
    .map((muscle) => ({ muscle, sets: cur.get(muscle) ?? 0, prevSets: prev.get(muscle) ?? 0, level: volumeLevel(cur.get(muscle) ?? 0) }))
    .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle));
}
