/** Deterministic PRNG (mulberry32) for property tests. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)];
  const subset = <T>(xs: readonly T[], min = 1): T[] => {
    for (;;) {
      const s = xs.filter(() => next() < 0.5);
      if (s.length >= min) return s;
    }
  };
  /** Random non-negative integers summing to total, length n (some may be 0). */
  const partition = (total: number, n: number): number[] => {
    const cuts = Array.from({ length: n - 1 }, () => int(0, total)).sort((x, y) => x - y);
    const out: number[] = [];
    let prev = 0;
    for (const c of cuts) {
      out.push(c - prev);
      prev = c;
    }
    out.push(total - prev);
    return out;
  };
  return { next, int, pick, subset, partition };
}
