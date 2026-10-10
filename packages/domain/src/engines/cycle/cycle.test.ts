import { describe, expect, it } from 'vitest';
import { DEFAULT_CYCLE, type CycleSettings } from '../../model';
import { cycleStatus, learnedCycleLength, registerPeriodStart } from './cycle';

const on = (patch: Partial<CycleSettings>): CycleSettings => ({ ...DEFAULT_CYCLE, enabled: true, ...patch });

describe('cycle phases', () => {
  const c = on({ lastPeriodStart: '2026-10-01', cycleLengthDays: 28, periodLengthDays: 5 });
  it('walks through the four phases of a 28-day cycle', () => {
    const phase = (d: string) => cycleStatus(c, d).phase;
    expect(phase('2026-10-01')).toBe('menstrual');
    expect(cycleStatus(c, '2026-10-01').day).toBe(1);
    expect(phase('2026-10-05')).toBe('menstrual');
    expect(phase('2026-10-06')).toBe('follicular');
    expect(phase('2026-10-12')).toBe('follicular');
    expect(phase('2026-10-13')).toBe('ovulatory');
    expect(phase('2026-10-15')).toBe('ovulatory');
    expect(phase('2026-10-16')).toBe('luteal');
    expect(phase('2026-10-28')).toBe('luteal');
    expect(cycleStatus(c, '2026-10-28').pms).toBe(true);
    expect(cycleStatus(c, '2026-10-20').pms).toBe(false);
  });
  it('continues into the next cycle and says when the next period is due', () => {
    const s = cycleStatus(c, '2026-10-30');
    expect(s.phase).toBe('menstrual');
    expect(s.day).toBe(2);
    expect(s.nextStart).toBe('2026-11-26');
    expect(cycleStatus(c, '2026-10-20').daysToNext).toBe(9);
  });
  it('asks to update the data a week after the expected start', () => {
    expect(cycleStatus(c, '2026-10-28').needsUpdate).toBe(false);
    expect(cycleStatus(c, '2026-11-06').needsUpdate).toBe(true);
  });
  it('knows nothing when it is off, has no date or the date is in the future', () => {
    expect(cycleStatus(undefined, '2026-10-10').known).toBe(false);
    expect(cycleStatus({ ...c, enabled: false }, '2026-10-10').known).toBe(false);
    expect(cycleStatus(on({ lastPeriodStart: null }), '2026-10-10').phase).toBeNull();
    expect(cycleStatus(on({ lastPeriodStart: '2026-11-01' }), '2026-10-10').phase).toBeNull();
  });
  it('a short and a long cycle move the ovulation window', () => {
    const short = on({ lastPeriodStart: '2026-10-01', cycleLengthDays: 24 });
    expect(cycleStatus(short, '2026-10-10').phase).toBe('ovulatory');
    const long = on({ lastPeriodStart: '2026-10-01', cycleLengthDays: 35 });
    expect(cycleStatus(long, '2026-10-10').phase).toBe('follicular');
    expect(cycleStatus(long, '2026-10-22').phase).toBe('ovulatory');
  });
});

describe('manual mode', () => {
  it('is the menstrual phase while on and unknown while off', () => {
    const m = on({ mode: 'manual', manualSince: '2026-10-08' });
    expect(cycleStatus(m, '2026-10-10')).toMatchObject({ phase: 'menstrual', day: 3 });
    expect(cycleStatus(on({ mode: 'manual', manualSince: null }), '2026-10-10')).toMatchObject({ known: true, phase: null });
  });
});

describe('learning the real length', () => {
  it('needs three marks and averages the gaps', () => {
    expect(learnedCycleLength(['2026-08-01', '2026-08-30'])).toBeNull();
    expect(learnedCycleLength(['2026-08-01', '2026-08-30', '2026-09-27'])).toBe(29);
  });
  it('registering a start keeps the history and updates the typical length', () => {
    let c = on({ lastPeriodStart: '2026-08-01' });
    c = registerPeriodStart(c, '2026-08-30');
    expect(c.cycleLengthDays).toBe(28);
    c = registerPeriodStart(c, '2026-09-27');
    expect(c.history).toEqual(['2026-08-01', '2026-08-30']);
    expect(c.lastPeriodStart).toBe('2026-09-27');
    expect(c.cycleLengthDays).toBe(29);
  });
});
