/**
 * Ideal double pendulum (point masses, massless rods, no friction).
 * Angles are measured from the downward vertical, in radians.
 */

export interface PendulumState {
  theta1: number;
  omega1: number;
  theta2: number;
  omega2: number;
}

export interface PendulumParams {
  m1: number;
  m2: number;
  l1: number;
  l2: number;
  g: number;
}

/** Time derivative of the state (standard Lagrangian equations of motion). */
export function derivatives(s: PendulumState, p: PendulumParams): PendulumState {
  const { m1, m2, l1, l2, g } = p;
  const { theta1: t1, omega1: w1, theta2: t2, omega2: w2 } = s;
  const d = t1 - t2;
  const sinD = Math.sin(d);
  const cosD = Math.cos(d);
  const den = 2 * m1 + m2 - m2 * Math.cos(2 * d);
  const a1 =
    (-g * (2 * m1 + m2) * Math.sin(t1) -
      m2 * g * Math.sin(t1 - 2 * t2) -
      2 * sinD * m2 * (w2 * w2 * l2 + w1 * w1 * l1 * cosD)) /
    (l1 * den);
  const a2 =
    (2 * sinD * (w1 * w1 * l1 * (m1 + m2) + g * (m1 + m2) * Math.cos(t1) + w2 * w2 * l2 * m2 * cosD)) / (l2 * den);
  return { theta1: w1, omega1: a1, theta2: w2, omega2: a2 };
}

function addScaled(s: PendulumState, k: PendulumState, h: number): PendulumState {
  return {
    theta1: s.theta1 + k.theta1 * h,
    omega1: s.omega1 + k.omega1 * h,
    theta2: s.theta2 + k.theta2 * h,
    omega2: s.omega2 + k.omega2 * h,
  };
}

/** One classic 4th-order Runge–Kutta step of size dt. */
export function rk4Step(s: PendulumState, p: PendulumParams, dt: number): PendulumState {
  const k1 = derivatives(s, p);
  const k2 = derivatives(addScaled(s, k1, dt / 2), p);
  const k3 = derivatives(addScaled(s, k2, dt / 2), p);
  const k4 = derivatives(addScaled(s, k3, dt), p);
  return {
    theta1: s.theta1 + (dt / 6) * (k1.theta1 + 2 * k2.theta1 + 2 * k3.theta1 + k4.theta1),
    omega1: s.omega1 + (dt / 6) * (k1.omega1 + 2 * k2.omega1 + 2 * k3.omega1 + k4.omega1),
    theta2: s.theta2 + (dt / 6) * (k1.theta2 + 2 * k2.theta2 + 2 * k3.theta2 + k4.theta2),
    omega2: s.omega2 + (dt / 6) * (k1.omega2 + 2 * k2.omega2 + 2 * k3.omega2 + k4.omega2),
  };
}

/** Advance `duration` seconds using fixed RK4 sub-steps of at most `maxDt`. */
export function integrate(s: PendulumState, p: PendulumParams, duration: number, maxDt = 1 / 1000): PendulumState {
  const steps = Math.max(1, Math.ceil(duration / maxDt));
  const dt = duration / steps;
  let cur = s;
  for (let i = 0; i < steps; i++) cur = rk4Step(cur, p, dt);
  return cur;
}

/** Bob positions with the pivot at the origin, y pointing down. */
export function positions(s: PendulumState, p: PendulumParams): { x1: number; y1: number; x2: number; y2: number } {
  const x1 = p.l1 * Math.sin(s.theta1);
  const y1 = p.l1 * Math.cos(s.theta1);
  return { x1, y1, x2: x1 + p.l2 * Math.sin(s.theta2), y2: y1 + p.l2 * Math.cos(s.theta2) };
}

export interface Energy {
  kinetic: number;
  potential: number;
  total: number;
}

/** Mechanical energy, potential measured from the pivot height. */
export function energy(s: PendulumState, p: PendulumParams): Energy {
  const { m1, m2, l1, l2, g } = p;
  const { theta1: t1, omega1: w1, theta2: t2, omega2: w2 } = s;
  const kinetic =
    0.5 * m1 * l1 * l1 * w1 * w1 +
    0.5 * m2 * (l1 * l1 * w1 * w1 + l2 * l2 * w2 * w2 + 2 * l1 * l2 * w1 * w2 * Math.cos(t1 - t2));
  const potential = -(m1 + m2) * g * l1 * Math.cos(t1) - m2 * g * l2 * Math.cos(t2);
  return { kinetic, potential, total: kinetic + potential };
}

/** Distance between the outer bobs of two pendulums (same parameters). */
export function bobSeparation(a: PendulumState, b: PendulumState, p: PendulumParams): number {
  const pa = positions(a, p);
  const pb = positions(b, p);
  return Math.hypot(pa.x2 - pb.x2, pa.y2 - pb.y2);
}

/** Angular-state distance, a smoother divergence measure than bob distance. */
export function stateDistance(a: PendulumState, b: PendulumState): number {
  return Math.hypot(a.theta1 - b.theta1, a.theta2 - b.theta2, a.omega1 - b.omega1, a.omega2 - b.omega2);
}
