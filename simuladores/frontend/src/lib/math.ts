/** H(n) - H(m) = Σ_{k=m+1}^{n} 1/k (0 when n ≤ m). */
export function harmonicRange(m: number, n: number): number {
  let s = 0;
  for (let k = m + 1; k <= n; k++) s += 1 / k;
  return s;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Keep at most `max` evenly spaced items (always keeps the last one). */
export function downsample<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return items.slice();
  const out: T[] = [];
  const step = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)]);
  return out;
}
