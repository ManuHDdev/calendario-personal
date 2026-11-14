import type { Rng } from './random';

/** A uniform point in the square [−1, 1]², flagged if inside the unit circle. */
export interface PiPoint {
  x: number;
  y: number;
  inside: boolean;
}

export function samplePiPoint(rng: Rng): PiPoint {
  const x = rng() * 2 - 1;
  const y = rng() * 2 - 1;
  return { x, y, inside: x * x + y * y <= 1 };
}

/** π ≈ 4 · (points inside) / (total points). */
export function estimatePiFromCircle(inside: number, total: number): number {
  return total === 0 ? NaN : (4 * inside) / total;
}

/** Standard deviation of the circle estimator after N points: 4·√(p(1−p)/N), p = π/4. */
export function circleEstimatorSd(total: number): number {
  const p = Math.PI / 4;
  return 4 * Math.sqrt((p * (1 - p)) / total);
}

/**
 * Uniform random direction that does not use π itself: rejection-sample a
 * point in the unit disc and normalise it.
 */
export function randomDirection(rng: Rng): { dx: number; dy: number } {
  for (;;) {
    const x = rng() * 2 - 1;
    const y = rng() * 2 - 1;
    const r2 = x * x + y * y;
    if (r2 > 1e-12 && r2 <= 1) {
      const r = Math.sqrt(r2);
      return { dx: x / r, dy: y / r };
    }
  }
}

export interface Needle {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  crosses: boolean;
}

/**
 * Buffon's needle on a plane ruled with horizontal lines at y = k·spacing.
 * The centre is uniform in [0, width] × [0, height]; height should be a
 * multiple of spacing so every centre sees the same line pattern.
 */
export function dropNeedle(rng: Rng, width: number, height: number, length: number, spacing: number): Needle {
  const cx = rng() * width;
  const cy = rng() * height;
  const { dx, dy } = randomDirection(rng);
  const hx = (dx * length) / 2;
  const hy = (dy * length) / 2;
  const y1 = cy - hy;
  const y2 = cy + hy;
  const crosses = Math.floor(y1 / spacing) !== Math.floor(y2 / spacing);
  return { x1: cx - hx, y1, x2: cx + hx, y2, crosses };
}

/** For length ≤ spacing, P(cross) = 2l/(πt), hence π ≈ 2·l·N / (t·crossings). */
export function estimatePiFromBuffon(length: number, spacing: number, total: number, crossings: number): number {
  return crossings === 0 ? NaN : (2 * length * total) / (spacing * crossings);
}

/** Theoretical crossing probability for length ≤ spacing. */
export function buffonCrossProbability(length: number, spacing: number): number {
  return (2 * length) / (Math.PI * spacing);
}
