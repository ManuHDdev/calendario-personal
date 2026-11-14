import { describe, expect, it } from 'vitest';
import { gaussian, mulberry32, randInt, randomPermutation, shuffle } from './random';
import { isPermutation } from './permutations';

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('produces values in [0, 1) with a roughly uniform mean', () => {
    const rng = mulberry32(7);
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const x = rng();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / 20000).toBeCloseTo(0.5, 1);
  });

  it('differs between seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('randInt / shuffle / randomPermutation', () => {
  it('randInt stays in range', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 1000; i++) {
      const v = randInt(rng, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });

  it('shuffle keeps the same elements', () => {
    const arr = shuffle([1, 2, 3, 4, 5, 6, 7], mulberry32(9));
    expect([...arr].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('randomPermutation is a permutation and every position is uniform', () => {
    const rng = mulberry32(11);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 8000; i++) {
      const p = randomPermutation(4, rng);
      expect(isPermutation(p)).toBe(true);
      counts[p[0]]++;
    }
    for (const c of counts) expect(c / 8000).toBeCloseTo(0.25, 1);
  });
});

describe('gaussian', () => {
  it('has mean ≈ 0 and variance ≈ 1', () => {
    const rng = mulberry32(5);
    let s = 0;
    let s2 = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const g = gaussian(rng);
      s += g;
      s2 += g * g;
    }
    expect(s / n).toBeCloseTo(0, 1);
    expect(s2 / n).toBeCloseTo(1, 1);
  });
});
