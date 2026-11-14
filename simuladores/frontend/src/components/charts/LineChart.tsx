import { useId, useMemo } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth';
import { extent, logTicks, makeScale, niceTicks } from '../../lib/chartScale';
import { downsample } from '../../lib/math';
import './charts.css';

export interface Point {
  x: number;
  y: number;
}

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  points: Point[];
  dashed?: boolean;
  width?: number;
  /** Draw markers instead of (or in addition to) the line. */
  dots?: boolean;
  noLine?: boolean;
}

export interface RefLine {
  axis: 'x' | 'y';
  value: number;
  label?: string;
  color?: string;
}

export interface Band {
  /** Shaded area between two curves sharing the same x values. */
  lower: Point[];
  upper: Point[];
  color: string;
}

interface Props {
  series: LineSeries[];
  refLines?: RefLine[];
  bands?: Band[];
  xDomain?: [number, number];
  yDomain?: [number, number];
  xLog?: boolean;
  yLog?: boolean;
  xLabel?: string;
  yLabel?: string;
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
  height?: number;
  ariaLabel: string;
  maxPoints?: number;
}

const M = { top: 12, right: 14, bottom: 34, left: 48 };

const defaultFormat = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 1 })} M`;
  if (a >= 1e4) return `${(v / 1e3).toLocaleString('es-ES', { maximumFractionDigits: 0 })} k`;
  return v.toLocaleString('es-ES', { maximumFractionDigits: a < 1 ? 2 : 1 });
};

export default function LineChart({
  series,
  refLines = [],
  bands = [],
  xDomain,
  yDomain,
  xLog = false,
  yLog = false,
  xLabel,
  yLabel,
  formatX = defaultFormat,
  formatY = defaultFormat,
  height = 200,
  ariaLabel,
  maxPoints = 400,
}: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const clipId = `clip${useId().replace(/:/g, '')}`;

  const data = useMemo(
    () => series.map((s) => ({ ...s, points: downsample(s.points.filter((p) => Number.isFinite(p.y)), maxPoints) })),
    [series, maxPoints],
  );

  const allX = data.flatMap((s) => s.points.map((p) => p.x));
  const allY = [
    ...data.flatMap((s) => s.points.map((p) => p.y)),
    ...refLines.filter((r) => r.axis === 'y').map((r) => r.value),
  ];
  let xd = xDomain ?? extent(allX) ?? [0, 1];
  let yd = yDomain ?? extent(allY) ?? [0, 1];
  if (xd[0] === xd[1]) xd = [xd[0] - 1, xd[1] + 1];
  if (yd[0] === yd[1]) yd = [yd[0] - 1, yd[1] + 1];
  if (xLog) xd = [Math.max(xd[0], 1e-12), Math.max(xd[1], xd[0] * 10)];
  if (yLog) yd = [Math.max(yd[0], 1e-12), Math.max(yd[1], yd[0] * 10)];

  const iw = Math.max(10, width - M.left - M.right);
  const ih = Math.max(10, height - M.top - M.bottom);
  const sx = makeScale(xd, [0, iw], xLog);
  const sy = makeScale(yd, [ih, 0], yLog);
  const xticks = xLog ? logTicks(xd[0], xd[1]) : niceTicks(xd[0], xd[1], Math.max(2, Math.floor(iw / 80)));
  const yticks = yLog ? logTicks(yd[0], yd[1]) : niceTicks(yd[0], yd[1], 4);

  const clampY = (v: number) => Math.max(-4, Math.min(ih + 4, v));
  const path = (pts: Point[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${clampY(sy(p.y)).toFixed(1)}`).join('');

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        <g transform={`translate(${M.left},${M.top})`}>
          {yticks.map((t) => (
            <g key={`y${t}`} transform={`translate(0,${sy(t)})`}>
              <line x2={iw} className="chart-grid" />
              <text x={-8} dy="0.32em" textAnchor="end" className="chart-tick">
                {formatY(t)}
              </text>
            </g>
          ))}
          {xticks.map((t) => (
            <g key={`x${t}`} transform={`translate(${sx(t)},0)`}>
              <line y1={ih} y2={ih + 4} className="chart-axis" />
              <text y={ih + 16} textAnchor="middle" className="chart-tick">
                {formatX(t)}
              </text>
            </g>
          ))}
          <line y1={ih} y2={ih} x2={iw} className="chart-axis" />

          {bands.map((b, i) => {
            const lo = downsample(b.lower, maxPoints);
            const hi = downsample(b.upper, maxPoints).reverse();
            if (lo.length < 2) return null;
            const d = `${path(lo)}${hi.map((p) => `L${sx(p.x).toFixed(1)},${clampY(sy(p.y)).toFixed(1)}`).join('')}Z`;
            return <path key={`band${i}`} d={d} fill={b.color} opacity={0.16} />;
          })}

          {refLines.map((r, i) =>
            r.axis === 'y' ? (
              <g key={`r${i}`}>
                <line x2={iw} y1={sy(r.value)} y2={sy(r.value)} stroke={r.color ?? 'var(--text-tertiary)'} className="chart-ref" />
                {r.label && (
                  <text x={iw - 4} y={sy(r.value) - 5} textAnchor="end" className="chart-ref-label" fill={r.color ?? 'var(--text-secondary)'}>
                    {r.label}
                  </text>
                )}
              </g>
            ) : (
              <g key={`r${i}`}>
                <line y2={ih} x1={sx(r.value)} x2={sx(r.value)} stroke={r.color ?? 'var(--text-tertiary)'} className="chart-ref" />
                {r.label && (
                  <text
                    x={sx(r.value) + 4}
                    y={10 + 13 * refLines.filter((q) => q.axis === 'x').indexOf(r)}
                    className="chart-ref-label"
                    fill={r.color ?? 'var(--text-secondary)'}
                  >
                    {r.label}
                  </text>
                )}
              </g>
            ),
          )}

          <defs>
            <clipPath id={clipId}>
              <rect x={-2} y={-2} width={iw + 4} height={ih + 4} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            {data.map((s) =>
              s.points.length === 0 ? null : (
                <g key={s.id}>
                  {!s.noLine && s.points.length > 1 && (
                    <path
                      d={path(s.points)}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={s.width ?? 2}
                      strokeDasharray={s.dashed ? '5 4' : undefined}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )}
                  {s.dots &&
                    s.points.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.6} fill={s.color} />)}
                </g>
              ),
            )}
          </g>
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
        {series.map((s) => (
          <li key={s.id}>
            <span
              className={`chart-swatch${s.dashed ? ' chart-swatch--dashed' : ''}${s.noLine ? ' chart-swatch--dot' : ''}`}
              style={{ color: s.color }}
            />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
