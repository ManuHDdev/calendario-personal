import { harmonicRange } from './math';
import { shuffle, type Rng } from './random';

/**
 * Secretary (optimal stopping) problem. `scores[i]` is the hidden quality of
 * the i-th candidate to arrive (all distinct, higher is better). With cutoff
 * r we only observe the first r candidates, then hire the first one better
 * than all of them; if nobody qualifies we are stuck with the last one.
 */

export interface SecretaryResult {
  /** Index of the hired candidate. */
  chosen: number;
  /** Index of the best candidate overall. */
  best: number;
  success: boolean;
  /** Best score seen during the look phase (−∞ when r = 0). */
  threshold: number;
}

export function argMax(values: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
}

export function runSecretary(scores: readonly number[], r: number): SecretaryResult {
  const n = scores.length;
  let threshold = -Infinity;
  for (let i = 0; i < r; i++) if (scores[i] > threshold) threshold = scores[i];
  let chosen = n - 1;
  for (let i = r; i < n; i++) {
    if (scores[i] > threshold) {
      chosen = i;
      break;
    }
  }
  const best = argMax(scores);
  return { chosen, best, success: chosen === best, threshold };
}

/**
 * For one arrival order, the cutoffs r ∈ [0, n−1] that hire the best
 * candidate form a contiguous range. With b = position of the best and
 * m = position of the best among the first b candidates it is r ∈ [m+1, b]
 * (or just r = 0 when b = 0). Lets one sample update every cutoff in O(n).
 * Returns [lo, hi] inclusive.
 */
export function successfulCutoffRange(scores: readonly number[]): [number, number] {
  const b = argMax(scores);
  if (b === 0) return [0, 0];
  let m = 0;
  for (let i = 1; i < b; i++) if (scores[i] > scores[m]) m = i;
  return [m + 1, b];
}

/** Uniformly random arrival order of the distinct scores 1..n. */
export function randomScores(n: number, rng: Rng): number[] {
  return shuffle(
    Array.from({ length: n }, (_, i) => i + 1),
    rng,
  );
}

/** P(success | n, r) = (r/n) Σ_{i=r+1}^{n} 1/(i−1); r = 0 → 1/n. */
export function theoreticalSecretarySuccess(n: number, r: number): number {
  if (r <= 0) return 1 / n;
  if (r >= n) return 0;
  return (r / n) * harmonicRange(r - 1, n - 1);
}

/** Cutoff r maximising the success probability. */
export function optimalCutoff(n: number): number {
  let bestR = 0;
  let bestP = -1;
  for (let r = 0; r < n; r++) {
    const p = theoreticalSecretarySuccess(n, r);
    if (p > bestP) {
      bestP = p;
      bestR = r;
    }
  }
  return bestR;
}
