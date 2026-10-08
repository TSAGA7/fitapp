import type { IdGenerator } from '@fitapp/domain';

export interface UuidSources {
  /** Milliseconds since the Unix epoch. */
  nowMs: () => number;
  randomBytes: (n: number) => Uint8Array;
}

const defaultSources = (): UuidSources => ({
  nowMs: () => Date.now(),
  randomBytes: (n) => {
    const out = new Uint8Array(n);
    globalThis.crypto.getRandomValues(out);
    return out;
  },
});

/**
 * UUID v7 (RFC 9562): 48-bit millisecond timestamp, version 7, a 12-bit counter that keeps ids
 * generated within the same millisecond ordered, variant 10 and 62 random bits.
 */
export function createUuidV7Generator(sources: UuidSources = defaultSources()): IdGenerator {
  let lastMs = -1;
  let counter = 0;
  const hex = (b: number) => b.toString(16).padStart(2, '0');
  return {
    newId(): string {
      let ms = sources.nowMs();
      const rnd = sources.randomBytes(10);
      if (ms > lastMs) {
        lastMs = ms;
        counter = (((rnd[0] as number) << 8) | (rnd[1] as number)) & 0x7ff; // start low: room to count up
      } else {
        // Same millisecond (or the clock went back): keep counting so ids stay increasing.
        counter++;
        if (counter > 0xfff) {
          counter = 0;
          lastMs++;
        }
        ms = lastMs;
      }
      const bytes = new Uint8Array(16);
      bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
      bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
      bytes[2] = Math.floor(ms / 2 ** 24) & 0xff;
      bytes[3] = Math.floor(ms / 2 ** 16) & 0xff;
      bytes[4] = Math.floor(ms / 2 ** 8) & 0xff;
      bytes[5] = ms & 0xff;
      bytes[6] = 0x70 | ((counter >> 8) & 0x0f);
      bytes[7] = counter & 0xff;
      bytes[8] = 0x80 | ((rnd[2] as number) & 0x3f);
      for (let i = 0; i < 7; i++) bytes[9 + i] = rnd[3 + i] as number;
      const h = [...bytes].map(hex).join('');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    },
  };
}

/** Milliseconds encoded in the first 48 bits of a UUID v7. */
export function uuidV7Timestamp(id: string): number {
  return parseInt(id.replace(/-/g, '').slice(0, 12), 16);
}
