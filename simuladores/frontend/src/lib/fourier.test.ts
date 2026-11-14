import { describe, expect, it } from 'vitest';
import { epicycleChain, harmonics, idealWave, maxOfPartialSum, partialSum, type WaveType } from './fourier';

describe('harmonics', () => {
  it('square wave uses odd frequencies with 4/(πk)', () => {
    const h = harmonics('square', 3);
    expect(h.map((x) => x.freq)).toEqual([1, 3, 5]);
    expect(h[1].amplitude).toBeCloseTo(4 / (3 * Math.PI), 12);
  });

  it('sawtooth alternates sign, triangle decays as 1/k²', () => {
    const s = harmonics('sawtooth', 3);
    expect(s.map((x) => Math.sign(x.amplitude))).toEqual([1, -1, 1]);
    const t = harmonics('triangle', 3);
    expect(t[1].amplitude).toBeCloseTo(-8 / (9 * Math.PI * Math.PI), 12);
  });
});

describe('partial sums converge to the ideal wave', () => {
  const points = [-2.5, -1, 0.4, 1.3, 2.9];
  const cases: [WaveType, number, number][] = [
    ['square', 400, 0.02],
    ['sawtooth', 400, 0.02],
    ['triangle', 50, 0.005],
  ];
  for (const [type, n, tol] of cases) {
    it(type, () => {
      const terms = harmonics(type, n);
      for (const t of points) expect(Math.abs(partialSum(terms, t) - idealWave(type, t))).toBeLessThan(tol);
    });
  }

  it('error shrinks as harmonics are added (triangle at t = 1)', () => {
    const e = (n: number) => Math.abs(partialSum(harmonics('triangle', n), 1) - idealWave('triangle', 1));
    expect(e(20)).toBeLessThan(e(2));
  });
});

describe('Gibbs phenomenon', () => {
  it('square-wave overshoot stays ≈ 1.179 no matter how many terms', () => {
    expect(maxOfPartialSum(harmonics('square', 100), 20000)).toBeCloseTo(1.179, 2);
    expect(maxOfPartialSum(harmonics('square', 200), 40000)).toBeCloseTo(1.179, 2);
  });
});

describe('epicycle chain', () => {
  it('tip height equals the partial sum', () => {
    const terms = harmonics('square', 7);
    for (const t of [0.3, 1.7, 4]) {
      const chain = epicycleChain(terms, t, 1);
      const tip = chain[chain.length - 1];
      expect(-tip.y).toBeCloseTo(partialSum(terms, t), 12);
      expect(chain.length).toBe(8);
    }
  });
});
