export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

export function sum(xs: readonly number[]): number {
  let t = 0;
  for (const x of xs) t += x;
  return t;
}

/** Removes floating point noise (0.1 + 0.2). */
export function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

export function unique<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)];
}
