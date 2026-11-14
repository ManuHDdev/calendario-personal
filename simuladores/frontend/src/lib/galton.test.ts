import { describe, expect, it } from 'vitest';
import {
  ballPath,
  binOf,
  binomialCoefficient,
  binomialDistribution,
  binomialPmf,
  histogramStats,
  normalPdf,
} from './galton';
import { mulberry32 } from './random';

describe('binomial', () => {
  it('coefficients match Pascal’s triangle', () => {
    expect([0, 1, 2, 3, 4].map((k) => binomialCoefficient(4, k))).toEqual([1, 4, 6, 4, 1]);
    expect(binomialCoefficient(20, 10)).toBe(184756);
    expect(binomialCoefficient(5, 7)).toBe(0);
  });

  it('pmf sums to 1 and has mean np, variance np(1−p)', () => {
    for (const [n, p] of [
      [12, 0.5],
      [20, 0.3],
      [7, 0.9],
    ] as const) {
      const d = binomialDistribution(n, p);
      expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      const mean = d.reduce((a, pk, k) => a + k * pk, 0);
      const varc = d.reduce((a, pk, k) => a + (k - mean) ** 2 * pk, 0);
      expect(mean).toBeCloseTo(n * p, 10);
      expect(varc).toBeCloseTo(n * p * (1 - p), 10);
    }
    expect(binomialPmf(3, 3, 0.5)).toBeCloseTo(0.125, 12);
  });

  it('normal pdf integrates to ≈ 1', () => {
    let s = 0;
    for (let x = -10; x <= 10; x += 0.01) s += normalPdf(x, 0, 1) * 0.01;
    expect(s).toBeCloseTo(1, 3);
  });
});

describe('simulated balls', () => {
  it('histogram matches the binomial (fixed seed)', () => {
    const rng = mulberry32(42);
    const rows = 10;
    const p = 0.5;
    const counts = new Array(rows + 1).fill(0);
    for (let i = 0; i < 20000; i++) {
      const path = ballPath(rows, p, rng);
      expect(path.length).toBe(rows);
      counts[binOf(path)]++;
    }
    const stats = histogramStats(counts);
    expect(stats.count).toBe(20000);
    expect(stats.mean).toBeCloseTo(rows * p, 1);
    expect(Math.abs(stats.variance - rows * p * (1 - p))).toBeLessThan(0.1);
    const pmf = binomialDistribution(rows, p);
    counts.forEach((c, k) => expect(Math.abs(c / 20000 - pmf[k])).toBeLessThan(0.01));
  });

  it('histogramStats of an empty histogram is zero', () => {
    expect(histogramStats([0, 0, 0])).toEqual({ count: 0, mean: 0, variance: 0 });
  });
});
