import { useElementWidth } from '../../hooks/useElementWidth';
import { makeScale, niceTicks } from '../../lib/chartScale';
import type { Point, RefLine } from './LineChart';
import './charts.css';

export interface Bar {
  x: number;
  value: number;
  color?: string;
}

export interface Overlay {
  id: string;
  label: string;
  color: string;
  points: Point[];
  dashed?: boolean;
  dots?: boolean;
}

interface Props {
  bars: Bar[];
  barLabel: string;
  barColor: string;
  overlays?: Overlay[];
  refLines?: RefLine[];
  xDomain?: [number, number];
  yMax?: number;
  xLabel?: string;
  yLabel?: string;
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
  height?: number;
  ariaLabel: string;
  /** Shade the region x > value (e.g. cycles longer than n/2). */
  shadeFrom?: { value: number; color: string; label?: string };
}

const M = { top: 12, right: 14, bottom: 34, left: 48 };

const fmt = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: Math.abs(v) < 1 ? 3 : 1 });

/** Histogram-style bars on integer x positions, with optional curve overlays. */
export default function BarChart({
  bars,
  barLabel,
  barColor,
  overlays = [],
  refLines = [],
  xDomain,
  yMax,
  xLabel,
  yLabel,
  formatX = (v) => String(Math.round(v)),
  formatY = fmt,
  height = 200,
  ariaLabel,
  shadeFrom,
}: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const xs = bars.map((b) => b.x);
  const xd: [number, number] = xDomain ?? [Math.min(...xs, 0) - 0.5, Math.max(...xs, 1) + 0.5];
  const maxVal = Math.max(
    yMax ?? 0,
    ...bars.map((b) => b.value),
    ...overlays.flatMap((o) => o.points.map((p) => p.y)),
    1e-12,
  );
  const yd: [number, number] = [0, yMax ?? maxVal * 1.08];

  const iw = Math.max(10, width - M.left - M.right);
  const ih = Math.max(10, height - M.top - M.bottom);
  const sx = makeScale(xd, [0, iw]);
  const sy = makeScale(yd, [ih, 0]);
  const bw = Math.max(1, (iw / (xd[1] - xd[0])) * 0.86);
  const xticks = niceTicks(Math.ceil(xd[0]), Math.floor(xd[1]), Math.max(2, Math.floor(iw / 60))).filter((t) =>
    Number.isInteger(t),
  );
  const yticks = niceTicks(0, yd[1], 4);

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        <g transform={`translate(${M.left},${M.top})`}>
          {shadeFrom && shadeFrom.value < xd[1] && (
            <g>
              <rect
                x={sx(shadeFrom.value)}
                width={Math.max(0, iw - sx(shadeFrom.value))}
                height={ih}
                fill={shadeFrom.color}
                opacity={0.08}
              />
              {shadeFrom.label && (
                <text x={iw - 4} y={10} textAnchor="end" className="chart-ref-label" fill={shadeFrom.color}>
                  {shadeFrom.label}
                </text>
              )}
            </g>
          )}
          {yticks.map((t) => (
            <g key={`y${t}`} transform={`translate(0,${sy(t)})`}>
              <line x2={iw} className="chart-grid" />
              <text x={-8} dy="0.32em" textAnchor="end" className="chart-tick">
                {formatY(t)}
              </text>
            </g>
          ))}
          {bars.map((b) => {
            const h = Math.max(0, ih - sy(b.value));
            return (
              <rect
                key={b.x}
                x={sx(b.x) - bw / 2}
                y={ih - h}
                width={bw}
                height={h}
                rx={Math.min(3, bw / 3)}
                fill={b.color ?? barColor}
                className="chart-bar"
              />
            );
          })}
          {overlays.map((o) => (
            <g key={o.id}>
              {o.points.length > 1 && (
                <path
                  d={o.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('')}
                  fill="none"
                  stroke={o.color}
                  strokeWidth={2}
                  strokeDasharray={o.dashed ? '5 4' : undefined}
                  strokeLinejoin="round"
                />
              )}
              {o.dots && o.points.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.4} fill={o.color} />)}
            </g>
          ))}
          {refLines.map((r, i) =>
            r.axis === 'x' ? (
              <g key={`r${i}`}>
                <line x1={sx(r.value)} x2={sx(r.value)} y2={ih} stroke={r.color ?? 'var(--text-tertiary)'} className="chart-ref" />
                {r.label && (
                  <text x={sx(r.value) + 4} y={22} className="chart-ref-label" fill={r.color ?? 'var(--text-secondary)'}>
                    {r.label}
                  </text>
                )}
              </g>
            ) : (
              <line key={`r${i}`} x2={iw} y1={sy(r.value)} y2={sy(r.value)} stroke={r.color ?? 'var(--text-tertiary)'} className="chart-ref" />
            ),
          )}
          <line y1={ih} y2={ih} x2={iw} className="chart-axis" />
          {xticks.map((t) => (
            <text key={`x${t}`} x={sx(t)} y={ih + 16} textAnchor="middle" className="chart-tick">
              {formatX(t)}
            </text>
          ))}
          {xLabel && (
            <text x={iw} y={ih + 30} textAnchor="end" className="chart-label">
              {xLabel}
            </text>
          )}
          {yLabel && (
            <text x={0} y={-2} className="chart-label">
              {yLabel}
            </text>
          )}
        </g>
      </svg>
      <ul className="chart-legend">
        <li>
          <span className="chart-swatch chart-swatch--bar" style={{ color: barColor }} />
          {barLabel}
        </li>
        {overlays.map((o) => (
          <li key={o.id}>
            <span className={`chart-swatch${o.dashed ? ' chart-swatch--dashed' : ''}`} style={{ color: o.color }} />
            {o.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
