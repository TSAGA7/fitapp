import { describe, expect, it } from 'vitest';
import { ownScheduleDays } from './customWorkout';

describe('ownScheduleDays', () => {
  const base = { startOn: '2026-10-19', weeks: 2, weekdays: ['monday', 'wednesday', 'friday'] as const, rotation: ['A', 'B'], overrides: [] };

  it('puts the workouts in turn on the chosen weekdays for the given weeks', () => {
    const days = ownScheduleDays({ ...base, weekdays: [...base.weekdays] });
    expect(days.map((d) => `${d.date}:${d.customWorkoutId}`)).toEqual([
      '2026-10-19:A', '2026-10-21:B', '2026-10-23:A', '2026-10-26:B', '2026-10-28:A', '2026-10-30:B',
    ]);
  });

  it('applies hand changes without shifting the rest of the rotation', () => {
    const days = ownScheduleDays({ ...base, weekdays: [...base.weekdays], overrides: [{ date: '2026-10-21', customWorkoutId: null }, { date: '2026-10-24', customWorkoutId: 'C' }, { date: '2026-12-01', customWorkoutId: 'A' }] });
    expect(days.find((d) => d.date === '2026-10-21')).toEqual({ date: '2026-10-21', customWorkoutId: null, changed: true });
    expect(days.find((d) => d.date === '2026-10-24')?.customWorkoutId).toBe('C');
    expect(days.find((d) => d.date === '2026-10-23')?.customWorkoutId).toBe('A');
    expect(days.some((d) => d.date === '2026-12-01')).toBe(false);
  });
});
