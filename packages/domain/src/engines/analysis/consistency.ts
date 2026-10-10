import { addDays, startOfWeek } from '../../util/localDate';

export type TrainingLevelId = 'none' | 'lazy' | 'hookah' | 'boss';

export interface TrainingLevel {
  id: TrainingLevelId;
  label: string;
  /** Workouts in 4 weeks if the plan is followed exactly. */
  planned: number;
  count: number;
}

export const LEVEL_LABELS: Record<TrainingLevelId, string> = {
  none: 'ты ленился ходить на тренировки, а я ленюсь присваивать тебе уровень',
  lazy: 'лодырь',
  hookah: 'кальянный спортсмен',
  boss: 'ты просто босс! Ты просто начальник!',
};

/**
 * Level for the last 4 weeks. The thresholds were set for 3 workouts a week (12 in 4 weeks): 0 / 1-3 / 4-8 / 9 and more.
 * For another schedule they scale with the plan: up to 25% of the plan is "lodyr", from 75% is "boss".
 */
export function trainingLevel(input: { count: number; perWeek: number }): TrainingLevel {
  const planned = Math.max(1, Math.round(input.perWeek)) * 4;
  const lazyMax = Math.max(1, Math.floor(0.25 * planned + 0.5));
  const bossMin = Math.ceil(0.75 * planned);
  const id: TrainingLevelId = input.count <= 0 ? 'none' : input.count <= lazyMax ? 'lazy' : input.count >= bossMin ? 'boss' : 'hookah';
  return { id, label: LEVEL_LABELS[id], planned, count: input.count };
}

export interface DatedWorkout {
  date: string;
  sets: number;
  tonnageKg: number;
}

const monthStart = (d: string): string => `${d.slice(0, 7)}-01`;
const prevMonthStart = (d: string): string => {
  const [y, m] = d.slice(0, 7).split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
};
const daysInMonth = (start: string): number => {
  const [y, m] = start.slice(0, 7).split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

export interface PeriodTotals {
  workouts: number;
  sets: number;
  tonnageKg: number;
}

export interface MonthComparison {
  /** This month up to today. */
  current: PeriodTotals;
  /** The previous month over the same number of days: the fair comparison. */
  previousSamePeriod: PeriodTotals;
  /** The whole previous month. */
  previousFull: PeriodTotals;
  /** Day of month today is (1-31). */
  day: number;
  currentStart: string;
  previousStart: string;
}

const sum = (list: readonly DatedWorkout[], from: string, to: string): PeriodTotals => {
  const r = { workouts: 0, sets: 0, tonnageKg: 0 };
  for (const w of list) if (w.date >= from && w.date <= to) { r.workouts++; r.sets += w.sets; r.tonnageKg += w.tonnageKg; }
  return { workouts: r.workouts, sets: r.sets, tonnageKg: Math.round(r.tonnageKg) };
};

/** This month so far against the same days of the previous month (and the whole previous month for reference). */
export function compareMonths(workouts: readonly DatedWorkout[], today: string): MonthComparison {
  const cs = monthStart(today);
  const ps = prevMonthStart(today);
  const day = Number(today.slice(8, 10));
  const pLen = daysInMonth(ps);
  const pSameEnd = addDays(ps, Math.min(day, pLen) - 1);
  const pEnd = addDays(ps, pLen - 1);
  return { current: sum(workouts, cs, today), previousSamePeriod: sum(workouts, ps, pSameEnd), previousFull: sum(workouts, ps, pEnd), day, currentStart: cs, previousStart: ps };
}

/** Weeks in a row (the current week counts once it is already full, otherwise it is skipped) with at least `perWeek` workouts. */
export function planStreakWeeks(workouts: readonly DatedWorkout[], today: string, perWeek: number): number {
  const need = Math.max(1, perWeek);
  const weekCount = (start: string): number => workouts.filter((w) => w.date >= start && w.date <= addDays(start, 6)).length;
  let start = startOfWeek(today);
  let streak = 0;
  if (weekCount(start) >= need) streak++;
  start = addDays(start, -7);
  for (let i = 0; i < 104; i++) {
    if (weekCount(start) < need) break;
    streak++;
    start = addDays(start, -7);
  }
  return streak;
}
