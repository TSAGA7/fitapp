import type { CycleSettings } from '../../model';
import { addDays, diffDays, type LocalDate } from '../../util/localDate';

/**
 * Menstrual cycle: where the woman is in it today. It is a guide for training and food, never a diagnosis:
 * the length and the timing differ from woman to woman and from month to month.
 */
export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';

export interface CycleStatus {
  /** The cycle is on and there is enough data to say something. */
  known: boolean;
  phase: CyclePhase | null;
  /** Day of the cycle (1 = first day of the period). In manual mode: day of the period. */
  day: number | null;
  /** The few days before the period, when PMS symptoms are most common. */
  pms: boolean;
  /** The next period should have started already: ask the user to mark it. */
  needsUpdate: boolean;
  nextStart: LocalDate | null;
  daysToNext: number | null;
}

const UNKNOWN: CycleStatus = { known: false, phase: null, day: null, pms: false, needsUpdate: false, nextStart: null, daysToNext: null };

/** Ovulation is about 14 days before the next period; the window is the day before, the day itself and the day after. */
export function ovulationDay(cycleLength: number, periodLength: number): number {
  return Math.max(periodLength + 3, cycleLength - 14);
}

export function cycleStatus(c: CycleSettings | undefined, today: LocalDate): CycleStatus {
  if (!c || !c.enabled) return UNKNOWN;
  if (c.mode === 'manual') {
    if (!c.manualSince || c.manualSince > today) return { ...UNKNOWN, known: true };
    return { known: true, phase: 'menstrual', day: diffDays(c.manualSince, today) + 1, pms: false, needsUpdate: false, nextStart: null, daysToNext: null };
  }
  if (!c.lastPeriodStart || c.lastPeriodStart > today) return UNKNOWN;
  const L = c.cycleLengthDays;
  const sinceStart = diffDays(c.lastPeriodStart, today);
  const day = (sinceStart % L) + 1;
  const ov = ovulationDay(L, c.periodLengthDays);
  const phase: CyclePhase = day <= c.periodLengthDays ? 'menstrual' : day >= ov - 1 && day <= ov + 1 ? 'ovulatory' : day < ov - 1 ? 'follicular' : 'luteal';
  const cyclesPassed = Math.floor(sinceStart / L);
  const nextStart = addDays(c.lastPeriodStart, (cyclesPassed + 1) * L);
  return {
    known: true,
    phase,
    day,
    pms: day >= L - 4,
    // a week past the expected start without a new mark: the data is probably out of date
    needsUpdate: sinceStart >= L + 7,
    nextStart,
    daysToNext: diffDays(today, nextStart),
  };
}

/** The real average cycle length from the marked starts (needs at least three marks), or null. */
export function learnedCycleLength(starts: readonly LocalDate[]): number | null {
  const s = [...starts].sort().slice(-7);
  const gaps: number[] = [];
  for (let i = 1; i < s.length; i++) {
    const g = diffDays(s[i - 1]!, s[i]!);
    if (g >= 21 && g <= 45) gaps.push(g);
  }
  if (gaps.length < 2) return null;
  return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
}

/** The period started on `date`: the previous start goes into the history and the typical length is learned from it. */
export function registerPeriodStart(c: CycleSettings, date: LocalDate): CycleSettings {
  const history = [...c.history];
  if (c.lastPeriodStart && c.lastPeriodStart < date && !history.includes(c.lastPeriodStart)) history.push(c.lastPeriodStart);
  history.sort();
  const learned = learnedCycleLength([...history, date]);
  return { ...c, enabled: true, mode: 'dates', lastPeriodStart: date, manualSince: null, history: history.slice(-24), cycleLengthDays: learned ?? c.cycleLengthDays };
}
