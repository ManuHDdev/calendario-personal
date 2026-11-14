/**
 * Fourier series of classic 2π-periodic waves, expressed as sums of
 * a_k · sin(k·t). Each term is an epicycle: a circle of radius |a_k| turning
 * at angular speed k (phase π when a_k < 0).
 */

export type WaveType = 'square' | 'sawtooth' | 'triangle';

export interface Harmonic {
  /** Angular frequency (integer multiple of the fundamental). */
  freq: number;
  /** Signed sine coefficient. */
  amplitude: number;
}

/** First `count` non-zero terms of the series. */
export function harmonics(type: WaveType, count: number): Harmonic[] {
  const terms: Harmonic[] = [];
  for (let i = 0; i < count; i++) {
    if (type === 'square') {
      const k = 2 * i + 1;
      terms.push({ freq: k, amplitude: 4 / (Math.PI * k) });
    } else if (type === 'sawtooth') {
      const k = i + 1;
      terms.push({ freq: k, amplitude: ((k % 2 === 1 ? 1 : -1) * 2) / (Math.PI * k) });
    } else {
      const k = 2 * i + 1;
      const sign = i % 2 === 0 ? 1 : -1;
      terms.push({ freq: k, amplitude: (sign * 8) / (Math.PI * Math.PI * k * k) });
    }
  }
  return terms;
}

/** S_N(t) = Σ a_k sin(k t). */
export function partialSum(terms: readonly Harmonic[], t: number): number {
  let s = 0;
  for (const h of terms) s += h.amplitude * Math.sin(h.freq * t);
  return s;
}

/** The ideal wave the series converges to (amplitude 1, period 2π). */
export function idealWave(type: WaveType, t: number): number {
  const TAU = 2 * Math.PI;
  // Reduce t to (−π, π].
  let u = ((t % TAU) + TAU) % TAU;
  if (u > Math.PI) u -= TAU;
  if (type === 'square') return u === 0 || Math.abs(u) === Math.PI ? 0 : Math.sign(u);
  if (type === 'sawtooth') return Math.abs(u) === Math.PI ? 0 : u / Math.PI;
  return (2 / Math.PI) * Math.asin(Math.sin(t));
}

/** Endpoints of the epicycle chain at time t (centre of each circle, then the tip). */
export function epicycleChain(terms: readonly Harmonic[], t: number, scale: number): { x: number; y: number; r: number }[] {
  const pts: { x: number; y: number; r: number }[] = [];
  let x = 0;
  let y = 0;
  for (const h of terms) {
    const r = Math.abs(h.amplitude) * scale;
    pts.push({ x, y, r });
    const phase = h.amplitude < 0 ? Math.PI : 0;
    const a = h.freq * t + phase;
    x += r * Math.cos(a);
    // Screen y grows downwards: subtract so a positive value is drawn upwards.
    y -= r * Math.sin(a);
  }
  pts.push({ x, y, r: 0 });
  return pts;
}

/** Maximum of S_N over a fine grid of one period (shows the Gibbs overshoot). */
export function maxOfPartialSum(terms: readonly Harmonic[], samples = 4000): number {
  let max = -Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = -Math.PI + (2 * Math.PI * i) / samples;
    const v = partialSum(terms, t);
    if (v > max) max = v;
  }
  return max;
}
