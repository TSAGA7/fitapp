/**
 * Calendar dates without time zones ("2026-10-01"). All arithmetic is done on
 * day numbers, so there is no dependency on the system clock or time zone.
 */
import { WEEKDAYS, type Weekday } from '../model/weekday';

export type LocalDate = string;

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(y: number, m: number): number {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string') return false;
  const m = RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

/** Days since 1970-01-01 (proleptic Gregorian). */
export function toDayNumber(date: LocalDate): number {
  const m = RE.exec(date);
  if (!m || !isLocalDate(date)) throw new RangeError(`Invalid LocalDate: ${date}`);
  let y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  y -= mo <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromDayNumber(days: number): LocalDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const year = y + (m <= 2 ? 1 : 0);
  return `${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addDays(date: LocalDate, n: number): LocalDate {
  return fromDayNumber(toDayNumber(date) + n);
}

/** b - a, in days. */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return toDayNumber(b) - toDayNumber(a);
}

export function weekdayOf(date: LocalDate): Weekday {
  // 1970-01-01 was a Thursday (index 3 when Monday = 0).
  const idx = (((toDayNumber(date) + 3) % 7) + 7) % 7;
  return WEEKDAYS[idx] as Weekday;
}

export function startOfWeek(date: LocalDate, weekStartsOn: Weekday = 'monday'): LocalDate {
  const current = WEEKDAYS.indexOf(weekdayOf(date));
  const start = WEEKDAYS.indexOf(weekStartsOn);
  const back = (current - start + 7) % 7;
  return addDays(date, -back);
}

/** Inclusive range of dates, ascending. Empty if from > to. */
export function dateRange(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  const end = toDayNumber(to);
  for (let n = toDayNumber(from); n <= end; n++) out.push(fromDayNumber(n));
  return out;
}

/**
 * Local calendar date of an instant in a given IANA time zone.
 * Deterministic for fixed inputs (no reliance on the current time).
 */
export function toLocalDate(isoInstant: string, timeZone: string): LocalDate {
  const t = new Date(isoInstant);
  if (Number.isNaN(t.getTime())) throw new RangeError(`Invalid instant: ${isoInstant}`);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(t);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
