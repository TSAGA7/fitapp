import { describe, expect, it } from 'vitest';
import { progressionKey } from './progressionKey';

describe('progressionKey', () => {
  it('separates variants, rep ranges and equipment of the same exercise', () => {
    const base = { exerciseId: 'db_incline_press_30', repMin: 8, repMax: 10 };
    const a = progressionKey({ ...base });
    expect(a).toBe('db_incline_press_30::default::8-10');
    expect(progressionKey({ ...base, variantKey: 'incline_45' })).not.toBe(a);
    expect(progressionKey({ ...base, repMin: 10, repMax: 12 })).not.toBe(a);
    expect(progressionKey({ ...base, equipmentId: 'smith_machine' })).toBe(`${a}::eq=smith_machine`);
  });

  it('is stable for the same context', () => {
    const ctx = { exerciseId: 'leg_press', variantKey: 'feet_high', repMin: 10, repMax: 12 };
    expect(progressionKey(ctx)).toBe(progressionKey({ ...ctx }));
  });

  it('rejects an inverted rep range', () => {
    expect(() => progressionKey({ exerciseId: 'x', repMin: 12, repMax: 8 })).toThrow();
  });
});
