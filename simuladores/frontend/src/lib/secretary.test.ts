import { describe, expect, it } from 'vitest';
import {
  optimalCutoff,
  randomScores,
  runSecretary,
  successfulCutoffRange,
  theoreticalSecretarySuccess,
} from './secretary';
import { mulberry32 } from './random';

describe('runSecretary', () => {
  it('hires the first candidate better than the look phase', () => {
    const res = runSecretary([3, 5, 2, 4, 6, 1], 2);
    expect(res.threshold).toBe(5);
    expect(res.chosen).toBe(4);
    expect(res.best).toBe(4);
    expect(res.success).toBe(true);
  });

  it('falls back to the last candidate when nobody beats the threshold', () => {
    const res = runSecretary([9, 1, 2, 3], 1);
    expect(res.chosen).toBe(3);
    expect(res.success).toBe(false);
  });

  it('r = 0 hires the very first candidate', () => {
    expect(runSecretary([2, 9, 1], 0).chosen).toBe(0);
  });
});

describe('successfulCutoffRange', () => {
  it('matches brute force over every cutoff', () => {
    const rng = mulberry32(17);
    for (let t = 0; t < 300; t++) {
      const n = 2 + (t % 15);
      const scores = randomScores(n, rng);
      const [lo, hi] = successfulCutoffRange(scores);
      for (let r = 0; r < n; r++) {
        expect(runSecretary(scores, r).success).toBe(r >= lo && r <= hi);
      }
    }
  });
});

describe('theory', () => {
  it('optimal cutoff for n = 100 is 37 with P ≈ 0.371', () => {
    expect(optimalCutoff(100)).toBe(37);
    expect(theoreticalSecretarySuccess(100, 37)).toBeCloseTo(0.371, 3);
  });

  it('optimal cutoff fraction and probability approach 1/e', () => {
    const n = 2000;
    const r = optimalCutoff(n);
    expect(r / n).toBeCloseTo(1 / Math.E, 2);
    expect(theoreticalSecretarySuccess(n, r)).toBeCloseTo(1 / Math.E, 3);
  });

  it('edge cases: r = 0 gives 1/n, small n by enumeration', () => {
    expect(theoreticalSecretarySuccess(10, 0)).toBeCloseTo(0.1, 12);
    // n = 3, r = 1: success orders are 213, 231, 312 → 3/6.
    expect(theoreticalSecretarySuccess(3, 1)).toBeCloseTo(0.5, 12);
  });

  it('Monte Carlo agrees with the theoretical curve (fixed seed)', () => {
    const n = 20;
    const trials = 20000;
    const counts = new Array(n).fill(0);
    const rng = mulberry32(2718);
    for (let t = 0; t < trials; t++) {
      const [lo, hi] = successfulCutoffRange(randomScores(n, rng));
      for (let r = lo; r <= hi; r++) counts[r]++;
    }
    for (let r = 0; r < n; r++) {
      expect(Math.abs(counts[r] / trials - theoreticalSecretarySuccess(n, r))).toBeLessThan(0.015);
    }
  });
});
