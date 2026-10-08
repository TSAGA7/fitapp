import { describe, expect, it } from 'vitest';
import { validateSeedCatalog } from '@fitapp/domain';
import { loadSeedCatalog, rawSeedCatalog } from './index';

describe('bundled seed catalog', () => {
  it('passes the domain validator without errors', () => {
    const report = validateSeedCatalog(rawSeedCatalog);
    expect(report.errors).toEqual([]);
  });

  it('has no warnings in the shipped data', () => {
    expect(validateSeedCatalog(rawSeedCatalog).warnings).toEqual([]);
  });

  it('loads through the typed loader', () => {
    const c = loadSeedCatalog();
    expect(c.equipment.length).toBeGreaterThanOrEqual(25);
    expect(c.exercises.length).toBeGreaterThanOrEqual(80);
    expect(c.foods.length).toBeGreaterThanOrEqual(30);
  });

  it('lets the same exercise be done in separate variants', () => {
    const c = loadSeedCatalog();
    const incline = c.exercises.find((e) => e.key === 'db_incline_press_30');
    expect(incline?.variants.map((v) => v.key)).toEqual(['default', 'incline_45', 'one_arm']);
  });

  it('links cooked and raw foods through yield factors', () => {
    const c = loadSeedCatalog();
    const cooked = c.foods.filter((f) => f.basis === 'cooked');
    expect(cooked.length).toBe(3);
    for (const f of cooked) {
      expect(f.yieldFactor).not.toBeNull();
      expect(c.foods.some((r) => r.variantGroup === f.variantGroup && r.basis !== 'cooked')).toBe(true);
    }
  });
});
