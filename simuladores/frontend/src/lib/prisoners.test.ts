import { describe, expect, it } from 'vitest';
import {
  longestCycleDistribution,
  loopSearch,
  loopStrategyWins,
  maxOpens,
  probAllCyclesAtMost,
  randomSearch,
  runPrisonersTrial,
  theoreticalLoopSuccess,
  theoreticalRandomSuccess,
} from './prisoners';
import { cycleOf, longestCycleLength } from './permutations';
import { mulberry32, randomPermutation } from './random';

describe('loop strategy', () => {
  it('walks the prisoner’s own cycle', () => {
    const perm = [2, 1, 4, 5, 0, 3];
    expect(loopSearch(perm, 0, 6)).toEqual({ opened: [0, 2, 4], found: true });
    expect(loopSearch(perm, 0, 2)).toEqual({ opened: [0, 2], found: false });
  });

  it('opened boxes are exactly the cycle when found', () => {
    const rng = mulberry32(1);
    const perm = randomPermutation(30, rng);
    for (let p = 0; p < 30; p++) {
      const res = loopSearch(perm, p, 30);
      expect(res.found).toBe(true);
      expect(res.opened).toEqual(cycleOf(perm, p));
    }
  });

  it('group wins iff the longest cycle is at most n/2', () => {
    const rng = mulberry32(2024);
    for (let t = 0; t < 300; t++) {
      const perm = randomPermutation(20, rng);
      expect(loopStrategyWins(perm)).toBe(longestCycleLength(perm) <= maxOpens(20));
    }
  });
});

describe('random strategy', () => {
  it('opens distinct boxes and never more than the limit', () => {
    const rng = mulberry32(8);
    const perm = randomPermutation(50, rng);
    for (let p = 0; p < 50; p++) {
      const res = randomSearch(perm, p, rng);
      expect(res.opened.length).toBeLessThanOrEqual(25);
      expect(new Set(res.opened).size).toBe(res.opened.length);
      expect(res.found).toBe(res.opened.some((b) => perm[b] === p));
    }
  });

  it('a single prisoner succeeds about half the time', () => {
    const rng = mulberry32(99);
    let wins = 0;
    for (let t = 0; t < 4000; t++) {
      const perm = randomPermutation(10, rng);
      if (randomSearch(perm, 0, rng).found) wins++;
    }
    expect(wins / 4000).toBeCloseTo(0.5, 1);
  });
});

describe('theory', () => {
  it('loop success for 100 prisoners is ≈ 31.18 %', () => {
    expect(theoreticalLoopSuccess(100)).toBeCloseTo(0.3118, 4);
  });

  it('loop success tends to 1 − ln 2', () => {
    expect(theoreticalLoopSuccess(10000)).toBeCloseTo(1 - Math.LN2, 4);
  });

  it('random success is (1/2)^n', () => {
    expect(theoreticalRandomSuccess(100)).toBeCloseTo(Math.pow(0.5, 100), 40);
    expect(theoreticalRandomSuccess(4)).toBe(1 / 16);
  });

  it('DP probability agrees with the closed form for k ≥ n/2', () => {
    expect(probAllCyclesAtMost(100, 50)).toBeCloseTo(theoreticalLoopSuccess(100), 10);
    expect(probAllCyclesAtMost(5, 5)).toBe(1);
  });

  it('small case by brute force: n = 4', () => {
    // 24 permutations of 4; longest cycle ≤ 2: identity(1) + 6 transpositions + 3 double transpositions = 10.
    expect(probAllCyclesAtMost(4, 2)).toBeCloseTo(10 / 24, 12);
    expect(probAllCyclesAtMost(4, 1)).toBeCloseTo(1 / 24, 12);
  });

  it('longest-cycle distribution sums to 1 and is 1/k above n/2', () => {
    const dist = longestCycleDistribution(100);
    expect(dist.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(dist[51]).toBeCloseTo(1 / 51, 12);
    expect(dist[100]).toBeCloseTo(1 / 100, 12);
    expect(dist.every((p) => p >= -1e-12)).toBe(true);
  });
});

describe('Monte Carlo', () => {
  it('loop strategy success rate converges to the theory with a fixed seed', () => {
    const rng = mulberry32(31415);
    let loopWins = 0;
    let randomWins = 0;
    const trials = 4000;
    for (let t = 0; t < trials; t++) {
      const r = runPrisonersTrial(100, rng);
      if (r.loopWin) loopWins++;
      if (r.randomWin) randomWins++;
      expect(r.loopWin).toBe(r.longestCycle <= 50);
    }
    expect(Math.abs(loopWins / trials - 0.3118)).toBeLessThan(0.025);
    expect(randomWins).toBe(0);
  });
});
