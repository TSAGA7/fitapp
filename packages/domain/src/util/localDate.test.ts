import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateRange,
  diffDays,
  fromDayNumber,
  isLocalDate,
  startOfWeek,
  toDayNumber,
  toLocalDate,
  weekdayOf,
} from './localDate';

describe('LocalDate', () => {
  it('validates real calendar dates only', () => {
    expect(isLocalDate('2026-10-01')).toBe(true);
    expect(isLocalDate('2024-02-29')).toBe(true);
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2026-13-01')).toBe(false);
    expect(isLocalDate('2026-1-1')).toBe(false);
    expect(isLocalDate(20261001)).toBe(false);
  });

  it('converts to and from day numbers', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
    expect(toDayNumber('2000-03-01')).toBe(11017);
    for (const d of ['1999-12-31', '2024-02-29', '2026-10-01', '2100-03-01']) {
      expect(fromDayNumber(toDayNumber(d))).toBe(d);
    }
  });

  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2026-10-01', 30)).toBe('2026-10-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('computes differences in days', () => {
    expect(diffDays('2026-10-01', '2026-10-15')).toBe(14);
    expect(diffDays('2026-10-15', '2026-10-01')).toBe(-14);
  });

  it('knows the weekday', () => {
    expect(weekdayOf('1970-01-01')).toBe('thursday');
    expect(weekdayOf('2026-10-01')).toBe('thursday');
    expect(weekdayOf('2026-10-05')).toBe('monday');
    expect(weekdayOf('2024-02-29')).toBe('thursday');
  });

  it('finds the start of the week', () => {
    expect(startOfWeek('2026-10-01')).toBe('2026-09-28');
    expect(startOfWeek('2026-09-28')).toBe('2026-09-28');
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28');
    expect(startOfWeek('2026-10-01', 'sunday')).toBe('2026-09-27');
  });

  it('builds inclusive ranges', () => {
    expect(dateRange('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(dateRange('2026-10-02', '2026-10-01')).toEqual([]);
  });

  it('derives the local date of an instant in a time zone', () => {
    expect(toLocalDate('2026-10-01T22:30:00Z', 'UTC')).toBe('2026-10-01');
    expect(toLocalDate('2026-10-01T22:30:00Z', 'Asia/Tokyo')).toBe('2026-10-02');
    expect(toLocalDate('2026-10-01T02:30:00Z', 'America/New_York')).toBe('2026-09-30');
  });

  it('rejects invalid input', () => {
    expect(() => toDayNumber('2026-02-30')).toThrow(RangeError);
    expect(() => toLocalDate('not a date', 'UTC')).toThrow(RangeError);
  });
});
