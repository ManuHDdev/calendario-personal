import { describe, expect, it } from 'vitest';
import {
  circlePoint,
  epicycloidPoint,
  knownShapeName,
  rollingCircleTurnsPerOrbit,
  timesTableChords,
  timesTableEnvelopePoint,
} from './cardioid';

describe('times table', () => {
  it('joins i with k·i mod N', () => {
    const chords = timesTableChords(10, 2);
    expect(chords.length).toBe(10);
    expect(chords[3]).toEqual({ from: 3, to: 6 });
    expect(chords[7]).toEqual({ from: 7, to: 4 });
  });

  it('supports non-integer multipliers', () => {
    expect(timesTableChords(10, 2.5)[3].to).toBeCloseTo(7.5, 12);
  });

  it('circle points lie on the circle, point 0 on the left', () => {
    const p0 = circlePoint(0, 12, 5);
    expect(p0.x).toBeCloseTo(-5, 12);
    expect(p0.y).toBeCloseTo(0, 12);
    for (let i = 0; i < 12; i += 0.5) {
      const p = circlePoint(i, 12, 5);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(5, 12);
    }
  });
});

describe('known shapes', () => {
  it('names curves near integer multipliers', () => {
    expect(knownShapeName(2)).toBe('Cardioide');
    expect(knownShapeName(3.01)).toBe('Nefroide');
    expect(knownShapeName(5)).toBe('Epicicloide de 4 cúspides');
    expect(knownShapeName(2.5)).toBeNull();
    expect(knownShapeName(1)).toBeNull();
  });
});

describe('epicycloid', () => {
  it('starts on the fixed circle', () => {
    const p = epicycloidPoint(3, 1, 0);
    expect(p.x).toBeCloseTo(3, 12);
    expect(p.y).toBeCloseTo(0, 12);
  });

  it('with equal radii it is a cardioid: ρ = 2a(1 − cos φ) around the cusp', () => {
    const a = 1;
    for (let t = 0.1; t < 2 * Math.PI; t += 0.37) {
      const p = epicycloidPoint(a, a, t);
      const dx = p.x - a;
      const dy = p.y;
      const rho = Math.hypot(dx, dy);
      const phi = Math.atan2(dy, dx);
      // Shifting the origin to the cusp (a, 0) gives (X, Y) = 2a(1 − cos t)(cos t, sin t).
      expect(phi).toBeCloseTo(Math.atan2(Math.sin(t), Math.cos(t)), 9);
      expect(rho).toBeCloseTo(2 * a * (1 - Math.cos(phi)), 9);
    }
  });

  it('coin rotation paradox: equal coins turn twice per orbit', () => {
    expect(rollingCircleTurnsPerOrbit(1, 1)).toBe(2);
    expect(rollingCircleTurnsPerOrbit(3, 1)).toBe(4);
  });
});

describe('times-table envelope', () => {
  for (const k of [2, 3, 4, 5]) {
    it(`k = ${k}: stays inside the circle and touches it at point 0 and every fixed point`, () => {
      const R = 1;
      let maxR = 0;
      const touches: number[] = [];
      for (let s = 0; s < 4000; s++) {
        const p = timesTableEnvelopePoint(k, R, (s / 4000) * 2 * Math.PI);
        const rr = Math.hypot(p.x, p.y);
        maxR = Math.max(maxR, rr);
        if (rr > 1 - 1e-5) touches.push(Math.atan2(p.y, p.x));
      }
      expect(maxR).toBeLessThanOrEqual(1 + 1e-9);
      // Every fixed point of i ↦ k·i lies at angle π + 2πj/(k−1): a touching point must be near each.
      for (let j = 0; j < k - 1; j++) {
        const target = Math.PI + (2 * Math.PI * j) / (k - 1);
        const near = touches.some((a) => Math.abs(Math.atan2(Math.sin(a - target), Math.cos(a - target))) < 0.01);
        expect(near).toBe(true);
      }
    });
  }
});
