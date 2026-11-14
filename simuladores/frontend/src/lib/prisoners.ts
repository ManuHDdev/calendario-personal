import { harmonicRange } from './math';
import { longestCycleLength } from './permutations';
import { randInt, randomPermutation, type Rng } from './random';

/**
 * 100 prisoners problem. Boxes and prisoners are numbered 0..n-1 and
 * `perm[box]` is the prisoner number hidden in that box. Each prisoner may
 * open `maxOpens(n)` boxes; the group wins only if every prisoner finds
 * their own number.
 */

export function maxOpens(n: number): number {
  return Math.floor(n / 2);
}

export interface SearchResult {
  /** Boxes opened, in order. */
  opened: number[];
  found: boolean;
}

/**
 * Loop strategy: open the box with your own number, then the box whose
 * number you just found, and so on. You walk along your own cycle.
 */
export function loopSearch(perm: readonly number[], prisoner: number, limit = maxOpens(perm.length)): SearchResult {
  const opened: number[] = [];
  let box = prisoner;
  while (opened.length < limit) {
    opened.push(box);
    if (perm[box] === prisoner) return { opened, found: true };
    box = perm[box];
  }
  return { opened, found: false };
}

/** Random strategy: open `limit` distinct boxes chosen uniformly at random. */
export function randomSearch(
  perm: readonly number[],
  prisoner: number,
  rng: Rng,
  limit = maxOpens(perm.length),
): SearchResult {
  const n = perm.length;
  const boxes = Array.from({ length: n }, (_, i) => i);
  const opened: number[] = [];
  for (let i = 0; i < limit; i++) {
    // Partial Fisher–Yates: draw without replacement.
    const j = i + randInt(rng, n - i);
    const tmp = boxes[i];
    boxes[i] = boxes[j];
    boxes[j] = tmp;
    opened.push(boxes[i]);
    if (perm[boxes[i]] === prisoner) return { opened, found: true };
  }
  return { opened, found: false };
}

/** Group outcome when everybody plays the loop strategy (simulated prisoner by prisoner). */
export function loopStrategyWins(perm: readonly number[]): boolean {
  for (let p = 0; p < perm.length; p++) {
    if (!loopSearch(perm, p).found) return false;
  }
  return true;
}

/** Group outcome for the random strategy. Stops at the first prisoner who fails. */
export function randomStrategyWins(perm: readonly number[], rng: Rng): boolean {
  for (let p = 0; p < perm.length; p++) {
    if (!randomSearch(perm, p, rng).found) return false;
  }
  return true;
}

export interface PrisonersTrial {
  longestCycle: number;
  loopWin: boolean;
  randomWin: boolean;
}

/**
 * One Monte Carlo trial of both strategies on independent permutations.
 * The loop strategy wins iff the longest cycle fits in the allowed opens,
 * which keeps each trial O(n).
 */
export function runPrisonersTrial(n: number, rng: Rng): PrisonersTrial {
  const perm = randomPermutation(n, rng);
  const longestCycle = longestCycleLength(perm);
  const loopWin = longestCycle <= maxOpens(n);
  const randomWin = randomStrategyWins(randomPermutation(n, rng), rng);
  return { longestCycle, loopWin, randomWin };
}

/** P(loop strategy wins) = 1 − Σ_{k=⌊n/2⌋+1}^{n} 1/k  (→ 1 − ln 2 ≈ 0.3069). */
export function theoreticalLoopSuccess(n: number): number {
  return 1 - harmonicRange(maxOpens(n), n);
}

/** P(random strategy wins) = (⌊n/2⌋/n)^n, i.e. (1/2)^n for even n. */
export function theoreticalRandomSuccess(n: number): number {
  return Math.pow(maxOpens(n) / n, n);
}

/**
 * P(every cycle of a uniform random permutation of size n has length ≤ k),
 * via p(m) = (1/m) Σ_{j=1}^{min(k,m)} p(m − j), p(0) = 1.
 */
export function probAllCyclesAtMost(n: number, k: number): number {
  if (k >= n) return 1;
  if (k <= 0) return n === 0 ? 1 : 0;
  const p = new Float64Array(n + 1);
  p[0] = 1;
  for (let m = 1; m <= n; m++) {
    let s = 0;
    for (let j = 1; j <= Math.min(k, m); j++) s += p[m - j];
    p[m] = s / m;
  }
  return p[n];
}

/** Exact distribution of the longest cycle length: index k → P(L = k), k = 0..n. */
export function longestCycleDistribution(n: number): number[] {
  const dist = new Array<number>(n + 1).fill(0);
  let prev = 0;
  for (let k = 1; k <= n; k++) {
    // For k ≥ n/2 the closed form P(L ≤ k) = 1 − Σ_{j>k} 1/j is exact and cheaper.
    const cdf = k >= n / 2 ? 1 - harmonicRange(k, n) : probAllCyclesAtMost(n, k);
    dist[k] = cdf - prev;
    prev = cdf;
  }
  return dist;
}
