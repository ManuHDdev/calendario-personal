import { describe, expect, it } from 'vitest';
import { energy, integrate, positions, rk4Step, stateDistance, type PendulumParams, type PendulumState } from './doublePendulum';

const params: PendulumParams = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };

describe('double pendulum', () => {
  it('rest state stays at rest', () => {
    const s: PendulumState = { theta1: 0, omega1: 0, theta2: 0, omega2: 0 };
    expect(rk4Step(s, params, 0.01)).toEqual(s);
  });

  it('positions follow the rod lengths', () => {
    const s: PendulumState = { theta1: Math.PI / 2, omega1: 0, theta2: 0, omega2: 0 };
    const p = positions(s, { ...params, l1: 2, l2: 1 });
    expect(p.x1).toBeCloseTo(2, 12);
    expect(p.y1).toBeCloseTo(0, 12);
    expect(p.x2).toBeCloseTo(2, 12);
    expect(p.y2).toBeCloseTo(1, 12);
  });

  it('RK4 conserves energy over a chaotic 10 s run', () => {
    const s0: PendulumState = { theta1: 2.2, omega1: 0, theta2: 2.6, omega2: 0 };
    const e0 = energy(s0, params).total;
    let s = s0;
    for (let i = 0; i < 10; i++) {
      s = integrate(s, params, 1, 1 / 1000);
      const drift = Math.abs(energy(s, params).total - e0) / Math.abs(e0);
      expect(drift).toBeLessThan(1e-4);
    }
  });

  it('small oscillations of a single-mode start stay small', () => {
    const s0: PendulumState = { theta1: 0.05, omega1: 0, theta2: 0.05, omega2: 0 };
    let s = s0;
    let maxAngle = 0;
    for (let i = 0; i < 300; i++) {
      s = integrate(s, params, 0.02);
      maxAngle = Math.max(maxAngle, Math.abs(s.theta1), Math.abs(s.theta2));
    }
    expect(maxAngle).toBeLessThan(0.2);
  });

  it('two almost identical chaotic starts diverge', () => {
    let a: PendulumState = { theta1: 2.5, omega1: 0, theta2: 2.5, omega2: 0 };
    let b: PendulumState = { ...a, theta2: a.theta2 + 1e-8 };
    const d0 = stateDistance(a, b);
    a = integrate(a, params, 20);
    b = integrate(b, params, 20);
    expect(stateDistance(a, b) / d0).toBeGreaterThan(1e4);
  });
});
