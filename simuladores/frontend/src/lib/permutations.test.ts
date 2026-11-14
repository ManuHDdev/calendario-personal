import { describe, expect, it } from 'vitest';
import { cycleDecomposition, cycleIndexMap, cycleOf, isPermutation, longestCycleLength } from './permutations';
import { mulberry32, randomPermutation } from './random';

describe('cycle decomposition', () => {
  // 0→2→4→0, 1→1, 3→5→3
  const perm = [2, 1, 4, 5, 0, 3];

  it('splits a known permutation into canonical cycles', () => {
    expect(cycleDecomposition(perm)).toEqual([[0, 2, 4], [1], [3, 5]]);
  });

  it('cycleOf follows the arrows from any start', () => {
    expect(cycleOf(perm, 4)).toEqual([4, 0, 2]);
    expect(cycleOf(perm, 1)).toEqual([1]);
  });

  it('cycleIndexMap assigns each element to its cycle', () => {
    expect(cycleIndexMap(perm)).toEqual([0, 1, 0, 2, 0, 2]);
  });

  it('longestCycleLength matches the decomposition', () => {
    expect(longestCycleLength(perm)).toBe(3);
    expect(longestCycleLength([0, 1, 2])).toBe(1);
    expect(longestCycleLength([1, 2, 3, 0])).toBe(4);
  });

  it('cycles partition every random permutation', () => {
    const rng = mulberry32(123);
    for (let t = 0; t < 50; t++) {
      const p = randomPermutation(40, rng);
      const cycles = cycleDecomposition(p);
      const all = cycles.flat().sort((a, b) => a - b);
      expect(all).toEqual(Array.from({ length: 40 }, (_, i) => i));
      for (const c of cycles) {
        for (let i = 0; i < c.length; i++) expect(p[c[i]]).toBe(c[(i + 1) % c.length]);
      }
      expect(longestCycleLength(p)).toBe(Math.max(...cycles.map((c) => c.length)));
    }
  });

  it('isPermutation rejects duplicates and out-of-range values', () => {
    expect(isPermutation([1, 0, 2])).toBe(true);
    expect(isPermutation([1, 1, 2])).toBe(false);
    expect(isPermutation([0, 3, 1])).toBe(false);
  });
});
