import type { Rng } from './random';

/** C(n, k) as a float (exact for the small n used here). */
export function binomialCoefficient(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const kk = Math.min(k, n - k);
  let c = 1;
  for (let i = 1; i <= kk; i++) c = (c * (n - kk + i)) / i;
  return c;
}

export function binomialPmf(n: number, k: number, p: number): number {
  return binomialCoefficient(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

/** [P(X = 0), …, P(X = n)] for X ~ Bin(n, p). */
export function binomialDistribution(n: number, p: number): number[] {
  return Array.from({ length: n + 1 }, (_, k) => binomialPmf(n, k, p));
}

export function normalPdf(x: number, mean: number, sd: number): number {
  const z = (x - mean) / sd;
  return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
}

/** One ball: for each row of pegs, 1 = bounces right (probability p), 0 = left. */
export function ballPath(rows: number, p: number, rng: Rng): number[] {
  const path: number[] = [];
  for (let i = 0; i < rows; i++) path.push(rng() < p ? 1 : 0);
  return path;
}

/** Final bin of a path = number of right bounces. */
export function binOf(path: readonly number[]): number {
  let s = 0;
  for (const step of path) s += step;
  return s;
}

export interface SampleStats {
  count: number;
  mean: number;
  variance: number;
}

/** Mean and (population) variance of a histogram indexed by value. */
export function histogramStats(counts: readonly number[]): SampleStats {
  let count = 0;
  let sum = 0;
  let sumSq = 0;
  counts.forEach((c, k) => {
    count += c;
    sum += c * k;
    sumSq += c * k * k;
  });
  if (count === 0) return { count: 0, mean: 0, variance: 0 };
  const mean = sum / count;
  return { count, mean, variance: sumSq / count - mean * mean };
}
