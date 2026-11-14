import { useMemo } from 'react';
import { circlePoint, timesTableChords } from '../lib/cardioid';
import { harmonics, partialSum } from '../lib/fourier';
import { binomialDistribution } from '../lib/galton';
import { integrate, positions, type PendulumState } from '../lib/doublePendulum';
import { cycleDecomposition } from '../lib/permutations';
import { mulberry32, randomPermutation } from '../lib/random';

/**
 * Small static illustrations for the hub cards, generated from the same pure
 * functions the simulators use. viewBox is 160 × 100.
 */

function PrisonersThumb() {
  const rings = useMemo(() => {
    const perm = randomPermutation(24, mulberry32(12));
    return cycleDecomposition(perm).sort((a, b) => b.length - a.length);
  }, []);
  let x = 10;
  return (
    <svg viewBox="0 0 160 100" aria-hidden>
      {rings.slice(0, 5).map((c, ci) => {
        const r = Math.max(5, (c.length * 6) / (2 * Math.PI));
        const cx = x + r;
        x += 2 * r + 8;
        if (cx + r > 158) return null;
        return (
          <g key={ci} className="thumb-spin" style={{ transformOrigin: `${cx}px 50px`, animationDuration: `${8 + ci * 3}s` }}>
            <circle cx={cx} cy={50} r={r} fill="none" stroke={`var(--sim-${(ci % 6) + 1})`} strokeWidth={1.5} opacity={0.5} />
            {c.map((_, i) => {
              const a = (2 * Math.PI * i) / c.length;
              return <circle key={i} cx={cx + r * Math.cos(a)} cy={50 + r * Math.sin(a)} r={2.6} fill={`var(--sim-${(ci % 6) + 1})`} />;
            })}
          </g>
        );
      })}
    </svg>
  );
}

function CardioidThumb() {
  const n = 72;
  return (
    <svg viewBox="0 0 160 100" aria-hidden>
      <g className="thumb-spin" style={{ transformOrigin: '80px 50px', animationDuration: '40s' }}>
        <circle cx={80} cy={50} r={44} fill="none" stroke="var(--border-strong)" />
        {timesTableChords(n, 2).map((c) => {
          const a = circlePoint(c.from, n, 44);
          const b = circlePoint(c.to, n, 44);
          return (
            <line
              key={c.from}
              x1={80 + a.x}
              y1={50 + a.y}
              x2={80 + b.x}
              y2={50 + b.y}
              stroke={`hsl(${(c.from / n) * 300 + 250}, 75%, 60%)`}
              strokeWidth={0.7}
              opacity={0.8}
            />
          );
        })}
      </g>
    </svg>
  );
}

function SecretaryThumb() {
  const scores = [5, 9, 3, 7, 11, 6, 14, 4, 10, 8];
  const r = 4;
  return (
    <svg viewBox="0 0 160 100" aria-hidden>
      <rect x={8} y={10} width={r * 14.4} height={84} rx={6} fill="var(--accent-soft)" />
      <line x1={8} x2={152} y1={90 - 9 * 5} y2={90 - 9 * 5} stroke="var(--text-tertiary)" strokeDasharray="3 3" />
      {scores.map((s, i) => (
        <rect
          key={i}
          x={12 + i * 14.4}
          y={90 - s * 5}
          width={10}
          height={s * 5}
          rx={2}
          fill={i === 4 ? 'var(--sim-4)' : i < r ? 'var(--sim-2)' : i === 6 ? 'var(--sim-3)' : 'var(--text-tertiary)'}
          opacity={i > 4 && i !== 6 ? 0.45 : 0.9}
        />
      ))}
    </svg>
  );
}

function MontyThumb() {
  return (
    <svg viewBox="0 0 160 100" aria-hidden>
      {[0, 1, 2].map((i) => {
        const x = 18 + i * 44;
        const open = i === 2;
        return (
          <g key={i}>
            <rect x={x} y={18} width={36} height={66} rx={4} fill="var(--bg-tertiary)" />
            {open ? (
              <g>
                <path d={`M${x} 18 L${x + 10} 24 L${x + 10} 78 L${x} 84 Z`} fill="var(--sim-3)" opacity={0.85} />
                <circle cx={x + 22} cy={56} r={7} fill="var(--text-tertiary)" />
              </g>
            ) : (
              <g className={i === 0 ? 'thumb-pulse' : undefined}>
                <rect x={x} y={18} width={36} height={66} rx={4} fill={i === 0 ? 'var(--sim-1)' : 'var(--sim-3)'} opacity={0.85} />
                <text x={x + 18} y={56} textAnchor="middle" fontSize={18} fontWeight={700} fill="#fff">
                  {i + 1}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function GaltonThumb() {
  const rows = 8;
  const pmf = binomialDistribution(rows, 0.5);
  return (
    <svg viewBox="0 0 160 100" aria-hidden>
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: r + 1 }, (_, k) => (
          <circle key={`${r}-${k}`} cx={80 + (k - r / 2) * 12} cy={8 + r * 6} r={1.4} fill="var(--text-tertiary)" />
        )),
      )}
      {pmf.map((p, k) => (
        <rect key={k} x={80 + (k - rows / 2) * 12 - 5} y={96 - p * 140} width={10} height={p * 140} rx={2} fill="var(--sim-2)" opacity={0.85} />
      ))}
      <circle className="thumb-fall" cx={80} cy={4} r={2.6} fill="var(--sim-1)" />
    </svg>
  );
}

function PiThumb() {
  const pts = useMemo(() => {
    const rng = mulberry32(3);
    return Array.from({ length: 160 }, () => ({ x: rng() * 2 - 1, y: rng() * 2 - 1 }));
  }, []);
  const s = 42;
  return (
    <svg viewBox="0 0 160 100" aria-hidden>
      <rect x={80 - s} y={50 - s} width={2 * s} height={2 * s} fill="none" stroke="var(--border-strong)" />
      <circle cx={80} cy={50} r={s} fill="none" stroke="var(--sim-1)" strokeWidth={1.2} />
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={80 + p.x * s}
          cy={50 + p.y * s}
          r={1.5}
          fill={p.x * p.x + p.y * p.y <= 1 ? 'var(--sim-1)' : 'var(--text-tertiary)'}
        />
      ))}
    </svg>
  );
}

function FourierThumb() {
  const d = useMemo(() => {
    const terms = harmonics('square', 6);
    const pts: string[] = [];
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * 4 * Math.PI;
      pts.push(`${i === 0 ? 'M' : 'L'}${(8 + i * 0.72).toFixed(1)},${(50 - partialSum(terms, t) * 30).toFixed(1)}`);
    }
    return pts.join('');
  }, []);
  return (
    <svg viewBox="0 0 160 100" aria-hidden>
      <line x1={8} x2={152} y1={50} y2={50} stroke="var(--border-strong)" />
      <path d={d} fill="none" stroke="var(--sim-2)" strokeWidth={2} strokeLinejoin="round" className="thumb-draw" />
    </svg>
  );
}

function PendulumThumb() {
  const { trail, arm } = useMemo(() => {
    const p = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
    let s: PendulumState = { theta1: 2.4, omega1: 0, theta2: 2.9, omega2: 0 };
    const pts: string[] = [];
    for (let i = 0; i < 260; i++) {
      s = integrate(s, p, 0.02, 1 / 200);
      const pos = positions(s, p);
      pts.push(`${i === 0 ? 'M' : 'L'}${(80 + pos.x2 * 22).toFixed(1)},${(46 + pos.y2 * 22).toFixed(1)}`);
    }
    return { trail: pts.join(''), arm: positions(s, p) };
  }, []);
  return (
    <svg viewBox="0 0 160 100" aria-hidden>
      <path d={trail} fill="none" stroke="var(--sim-1)" strokeWidth={1} opacity={0.6} />
      <line x1={80} y1={46} x2={80 + arm.x1 * 22} y2={46 + arm.y1 * 22} stroke="var(--text-secondary)" strokeWidth={1.6} />
      <line x1={80 + arm.x1 * 22} y1={46 + arm.y1 * 22} x2={80 + arm.x2 * 22} y2={46 + arm.y2 * 22} stroke="var(--text-secondary)" strokeWidth={1.6} />
      <circle cx={80} cy={46} r={2} fill="var(--text-secondary)" />
      <circle cx={80 + arm.x1 * 22} cy={46 + arm.y1 * 22} r={4} fill="var(--sim-2)" />
      <circle cx={80 + arm.x2 * 22} cy={46 + arm.y2 * 22} r={4} fill="var(--sim-1)" />
    </svg>
  );
}

const THUMBS: Record<string, () => JSX.Element> = {
  prisioneros: PrisonersThumb,
  cardioide: CardioidThumb,
  'parada-optima': SecretaryThumb,
  'monty-hall': MontyThumb,
  galton: GaltonThumb,
  pi: PiThumb,
  fourier: FourierThumb,
  'pendulo-doble': PendulumThumb,
};

export default function Thumbnail({ id }: { id: string }) {
  const T = THUMBS[id];
  return T ? <T /> : null;
}
