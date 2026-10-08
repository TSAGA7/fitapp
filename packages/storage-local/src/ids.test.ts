import { describe, expect, it } from 'vitest';
import { createUuidV7Generator, uuidV7Timestamp } from './ids';

const fixedRandom = (n: number) => new Uint8Array(n).fill(0xab);

describe('UUID v7', () => {
  it('has the right shape, version and variant', () => {
    const id = createUuidV7Generator().newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('encodes the timestamp', () => {
    const g = createUuidV7Generator({ nowMs: () => 1_790_000_123_456, randomBytes: fixedRandom });
    expect(uuidV7Timestamp(g.newId())).toBe(1_790_000_123_456);
  });
  it('ids generated in the same millisecond keep increasing', () => {
    const g = createUuidV7Generator({ nowMs: () => 1_790_000_000_000, randomBytes: fixedRandom });
    const ids = Array.from({ length: 3000 }, () => g.newId());
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(3000);
  });
  it('stays increasing even if the clock goes backwards', () => {
    let t = 1_790_000_005_000;
    const g = createUuidV7Generator({ nowMs: () => t, randomBytes: fixedRandom });
    const a = g.newId();
    t -= 4000;
    const b = g.newId();
    expect(b > a).toBe(true);
  });
  it('is unique with the real random source', () => {
    const g = createUuidV7Generator();
    expect(new Set(Array.from({ length: 5000 }, () => g.newId())).size).toBe(5000);
  });
  it('ids from later milliseconds sort later', () => {
    let t = 1_790_000_000_000;
    const g = createUuidV7Generator({ nowMs: () => t, randomBytes: fixedRandom });
    const a = g.newId();
    t += 1;
    expect(g.newId() > a).toBe(true);
  });
});
