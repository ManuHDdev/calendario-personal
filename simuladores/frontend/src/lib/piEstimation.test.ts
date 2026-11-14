import { describe, expect, it } from 'vitest';
import {
  buffonCrossProbability,
  circleEstimatorSd,
  dropNeedle,
  estimatePiFromBuffon,
  estimatePiFromCircle,
  randomDirection,
  samplePiPoint,
} from './piEstimation';
import { mulberry32 } from './random';

describe('points in a square', () => {
  it('estimate converges to π within 3σ (fixed seed)', () => {
    const rng = mulberry32(314);
    const n = 100000;
    let inside = 0;
    for (let i = 0; i < n; i++) {
      const p = samplePiPoint(rng);
      expect(p.inside).toBe(p.x * p.x + p.y * p.y <= 1);
      if (p.inside) inside++;
    }
    const est = estimatePiFromCircle(inside, n);
    expect(Math.abs(est - Math.PI)).toBeLessThan(3 * circleEstimatorSd(n));
  });

  it('no points → NaN', () => {
    expect(estimatePiFromCircle(0, 0)).toBeNaN();
  });
});

describe('Buffon’s needle', () => {
  it('random directions are unit vectors', () => {
    const rng = mulberry32(2);
    for (let i = 0; i < 100; i++) {
      const { dx, dy } = randomDirection(rng);
      expect(Math.hypot(dx, dy)).toBeCloseTo(1, 12);
    }
  });

  it('needle has the requested length and crossing is geometric', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 200; i++) {
      const nd = dropNeedle(rng, 100, 100, 8, 10);
      expect(Math.hypot(nd.x2 - nd.x1, nd.y2 - nd.y1)).toBeCloseTo(8, 9);
      expect(nd.crosses).toBe(Math.floor(nd.y1 / 10) !== Math.floor(nd.y2 / 10));
    }
  });

  it('crossing frequency matches 2l/(πt) and the estimate approaches π', () => {
    const rng = mulberry32(1777);
    const n = 100000;
    let crosses = 0;
    for (let i = 0; i < n; i++) if (dropNeedle(rng, 200, 200, 7, 10).crosses) crosses++;
    expect(Math.abs(crosses / n - buffonCrossProbability(7, 10))).toBeLessThan(0.006);
    expect(Math.abs(estimatePiFromBuffon(7, 10, n, crosses) - Math.PI)).toBeLessThan(0.05);
  });
});
