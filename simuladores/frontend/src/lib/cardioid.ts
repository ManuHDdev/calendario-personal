/**
 * Times-table circles and epicycloids.
 *
 * Times table: N points on a circle; join point i with point k·i (mod N).
 * For integer k the envelope of those chords is an epicycloid with k − 1
 * cusps (k = 2 cardioid, k = 3 nephroid, …).
 */

export interface Chord {
  from: number;
  /** Fractional point index in [0, N) — k may be non-integer. */
  to: number;
}

export function timesTableChords(n: number, k: number): Chord[] {
  const chords: Chord[] = [];
  for (let i = 0; i < n; i++) {
    const to = (((k * i) % n) + n) % n;
    chords.push({ from: i, to });
  }
  return chords;
}

/**
 * Position of (possibly fractional) point index `idx` on a circle of radius R
 * centred at the origin. Point 0 sits on the left so the cardioid's cusp
 * points left, matching the rolling-circle view.
 */
export function circlePoint(idx: number, n: number, radius: number): { x: number; y: number } {
  const a = Math.PI + (2 * Math.PI * idx) / n;
  return { x: radius * Math.cos(a), y: radius * Math.sin(a) };
}

/** Spanish name of the curve that appears near integer multipliers, or null. */
export function knownShapeName(k: number, tolerance = 0.03): string | null {
  const r = Math.round(k);
  if (Math.abs(k - r) > tolerance || r < 2) return null;
  if (r === 2) return 'Cardioide';
  if (r === 3) return 'Nefroide';
  return `Epicicloide de ${r - 1} cúspides`;
}

/**
 * Epicycloid: a circle of radius r rolling outside a fixed circle of radius
 * R. Returns the traced rim point after the centre has turned by angle t.
 * The point starts touching the fixed circle at (R, 0).
 */
export function epicycloidPoint(R: number, r: number, t: number): { x: number; y: number } {
  const ratio = (R + r) / r;
  return {
    x: (R + r) * Math.cos(t) - r * Math.cos(ratio * t),
    y: (R + r) * Math.sin(t) - r * Math.sin(ratio * t),
  };
}

/** Turns of the rolling circle about its own centre per orbit: (R + r) / r (coin rotation paradox). */
export function rollingCircleTurnsPerOrbit(R: number, r: number): number {
  return (R + r) / r;
}

/**
 * Envelope of the times-table chords for an integer multiplier k ≥ 2, on a
 * circle of radius R laid out like `circlePoint`: an epicycloid with k − 1
 * cusps (fixed radius (k−1)R/(k+1), rolling radius R/(k+1)). It touches the
 * circle at the fixed points of i ↦ k·i (angles π + 2πj/(k−1)), so the curve
 * is rotated by π − π/(k−1) to put one touching point at point 0.
 */
export function timesTableEnvelopePoint(k: number, R: number, t: number): { x: number; y: number } {
  const r0 = R / (k + 1);
  const p = epicycloidPoint((k - 1) * r0, r0, t);
  const phi = Math.PI - Math.PI / (k - 1);
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}
