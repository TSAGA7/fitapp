import type { LocalDate } from '../../util/localDate';

export interface StrengthRow {
  exerciseId: string;
  date: LocalDate;
  weightKg: number | null;
  reps: number;
  setType: 'working' | 'warmup' | 'drop';
}

export interface StrengthSession {
  date: LocalDate;
  topWeightKg: number;
  repsAtTop: number;
  sets: number;
  totalReps: number;
  volumeKg: number;
}

export interface ExerciseStrength {
  exerciseId: string;
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
        return {
          date,
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
    out.push({
      exerciseId,
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
