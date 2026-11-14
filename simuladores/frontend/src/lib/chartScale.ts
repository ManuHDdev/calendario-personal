/** Axis helpers for the small SVG charts. */

/** "Nice" round step (1, 2, 2.5, 5 × 10^k) so that range/step ≈ count. */
export function niceStep(range: number, count: number): number {
  if (!(range > 0) || count <= 0) return 1;
  const raw = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

/** Evenly spaced round tick values covering [min, max]. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const step = niceStep(max - min, count);
  const start = Math.ceil(min / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) ticks.push(Math.round(v / step) * step + 0);
  return ticks;
}

/** Powers of ten inside [min, max] (min > 0). */
export function logTicks(min: number, max: number): number[] {
  if (!(min > 0) || !(max > min)) return [];
  const ticks: number[] = [];
  for (let e = Math.ceil(Math.log10(min) - 1e-9); e <= Math.floor(Math.log10(max) + 1e-9); e++) ticks.push(10 ** e);
  return ticks;
}

/** Linear or logarithmic mapping from a data domain to a pixel range. */
export function makeScale(domain: [number, number], range: [number, number], log = false): (v: number) => number {
  const [d0, d1] = log ? [Math.log10(domain[0]), Math.log10(domain[1])] : domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (v: number) => {
    const x = log ? Math.log10(Math.max(v, 1e-300)) : v;
    return r0 + ((x - d0) / span) * (r1 - r0);
  };
}

/** [min, max] of a list of numbers, ignoring non-finite values. */
export function extent(values: Iterable<number>): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min === Infinity ? null : [min, max];
}
