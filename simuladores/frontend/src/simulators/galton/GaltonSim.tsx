import { useEffect, useMemo, useRef, useState } from 'react';
import BarChart from '../../components/charts/BarChart';
import { Button, ControlRow, PlayPauseButton, ResetButton, Slider, SpeedControl, Stat, StatGrid, Toggle } from '../../components/controls/Controls';
import { Explanation, Panel, SimMain, SimPage, Stage } from '../../components/layout/SimLayout';
import { useAnimationFrame } from '../../hooks/useAnimationFrame';
import { useCanvas } from '../../hooks/useCanvas';
import { useThemeColors } from '../../hooks/useThemeColors';
import { ballPath, binOf, binomialDistribution, histogramStats, normalPdf } from '../../lib/galton';
import { formatDecimal, formatInt } from '../../lib/format';
import { mulberry32, randomSeed, type Rng } from '../../lib/random';
import { roundRectPath, usePlayback } from '../shared';
import '../sims.css';

interface Ball {
  path: number[];
  /** Progress in row units, 0 … rows + 2 (see the drawing code). */
  s: number;
  hue: number;
}

const MAX_BALLS = 450;

export default function GaltonSim() {
  const colors = useThemeColors();
  const { playing, toggle, speed, setSpeed } = usePlayback(1);
  const [rows, setRows] = useState(12);
  const [p, setP] = useState(0.5);
  const [flow, setFlow] = useState(12);
  const [showNormal, setShowNormal] = useState(true);
  const [, setFrame] = useState(0);
  const rng = useRef<Rng>(mulberry32(randomSeed()));
  const balls = useRef<Ball[]>([]);
  const counts = useRef<number[]>(new Array(rows + 1).fill(0));
  const emitAcc = useRef(0);
  const { canvasRef, size, getContext } = useCanvas();

  const reset = () => {
    balls.current = [];
    counts.current = new Array(rows + 1).fill(0);
    setFrame((f) => f + 1);
  };
  useEffect(reset, [rows, p]);

  useAnimationFrame((dt) => {
    emitAcc.current += dt * flow * speed;
    while (emitAcc.current >= 1) {
      emitAcc.current -= 1;
      if (balls.current.length < MAX_BALLS) balls.current.push({ path: ballPath(rows, p, rng.current), s: 0, hue: rng.current() });
    }
    const rate = 7 * Math.sqrt(speed);
    const keep: Ball[] = [];
    for (const b of balls.current) {
      b.s += dt * rate;
      if (b.s >= rows + 2) counts.current[binOf(b.path)]++;
      else keep.push(b);
    }
    balls.current = keep;
    setFrame((f) => f + 1);
  }, playing);

  const dropInstant = (k: number) => {
    for (let i = 0; i < k; i++) counts.current[binOf(ballPath(rows, p, rng.current))]++;
    setFrame((f) => f + 1);
  };

  const pmf = useMemo(() => binomialDistribution(rows, p), [rows, p]);
  const stats = histogramStats(counts.current);
  const mean = rows * p;
  const sd = Math.sqrt(rows * p * (1 - p));

  useEffect(() => {
    const ctx = getContext();
    const { width: W, height: H } = size;
    if (!ctx || W < 2 || counts.current.length !== rows + 1) return;
    ctx.fillStyle = colors.canvasBg;
    ctx.fillRect(0, 0, W, H);

    const dx = Math.min((W * 0.94) / (rows + 1), 46);
    const cx = W / 2;
    const pegTop = 26;
    const pegH = H * 0.5;
    const dy = pegH / rows;
    const binTop = pegTop + pegH + dy * 0.6;
    const binBottom = H - 8;
    const ballR = Math.max(2.2, Math.min(5, dx * 0.16));
    const pegR = Math.max(1.4, Math.min(3, dx * 0.08));

    // Pegs
    ctx.fillStyle = colors.textTertiary;
    for (let j = 0; j < rows; j++) {
      for (let k = 0; k <= j; k++) {
        ctx.beginPath();
        ctx.arc(cx + (k - j / 2) * dx, pegTop + j * dy, pegR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Bin walls
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    for (let k = 0; k <= rows + 1; k++) {
      const x = cx + (k - 0.5 - rows / 2) * dx;
      ctx.beginPath();
      ctx.moveTo(x, binTop);
      ctx.lineTo(x, binBottom);
      ctx.stroke();
    }

    // Histogram of landed balls, scaled so the expected peak uses ~85 % of the bin height.
    const total = stats.count;
    const maxExpected = Math.max(...pmf) * Math.max(total, 1);
    const scale = Math.max(maxExpected, ...counts.current, 1) / 0.88;
    const hAvail = binBottom - binTop;
    counts.current.forEach((c, k) => {
      const h = (c / scale) * hAvail;
      const x = cx + (k - rows / 2) * dx;
      if (h > 0) {
        roundRectPath(ctx, x - dx * 0.4, binBottom - h, dx * 0.8, h, Math.min(4, dx * 0.15));
        ctx.fillStyle = colors.series[1];
        ctx.globalAlpha = 0.8;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    });

    if (total > 0) {
      // Expected counts N·P(k): dots.
      ctx.fillStyle = colors.series[2];
      pmf.forEach((pk, k) => {
        const y = binBottom - ((pk * total) / scale) * hAvail;
        ctx.beginPath();
        ctx.arc(cx + (k - rows / 2) * dx, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      if (showNormal && sd > 0) {
        ctx.strokeStyle = colors.series[0];
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 200; i++) {
          const k = -0.5 + ((rows + 1) * i) / 200;
          const y = binBottom - ((normalPdf(k, mean, sd) * total) / scale) * hAvail;
          const x = cx + (k - rows / 2) * dx;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // Falling balls. s ∈ [0,1): drop onto the top peg; [j+1, j+2): hop from
    // row j to row j+1 (left or right); [rows+1, rows+2): fall into the bin.
    const lift = ballR + pegR;
    for (const b of balls.current) {
      let x: number;
      let y: number;
      if (b.s < 1) {
        x = cx;
        y = pegTop - dy + dy * b.s * b.s - lift;
      } else if (b.s < rows + 1) {
        const j = Math.floor(b.s) - 1;
        const u = b.s - (j + 1);
        let right = 0;
        for (let i = 0; i < j; i++) right += b.path[i];
        const x0 = cx + (right - j / 2) * dx;
        x = x0 + (b.path[j] ? 1 : -1) * (dx / 2) * u;
        y = pegTop + j * dy + dy * u * u - dy * 0.3 * Math.sin(Math.PI * u) - lift;
      } else {
        const u = b.s - (rows + 1);
        x = cx + (binOf(b.path) - rows / 2) * dx;
        const y0 = pegTop + rows * dy - lift;
        y = y0 + (binBottom - ballR - y0) * u * u;
      }
      ctx.beginPath();
      ctx.arc(x, y, ballR, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${255 + b.hue * 70}, 70%, ${colors.dark ? 68 : 55}%)`;
      ctx.fill();
    }
  });

  const bars = counts.current.map((c, k) => ({ x: k, value: stats.count ? c / stats.count : 0 }));

  return (
    <SimPage
      title="Tablero de Galton"
      lead="Cada bola rebota a izquierda o derecha en cada clavo. Ninguna sabe adónde va, pero entre todas dibujan siempre la misma forma."
    >
      <SimMain
        stage={
          <Panel title="El tablero" actions={<span className="sim-badge sim-badge--neutral">{formatInt(stats.count)} bolas</span>}>
            <Stage canvasRef={canvasRef} aspect="4 / 3.4" maxHeight="80vh" label="Tablero de Galton con bolas cayendo" />
            <p className="sim-note">
              Barras: bolas caídas en cada casilla. Puntos naranjas: lo esperado según la binomial. Línea morada: la
              aproximación normal.
            </p>
          </Panel>
        }
        side={
          <>
            <Panel title="Controles">
              <ControlRow>
                <PlayPauseButton playing={playing} onToggle={toggle} />
                <Button onClick={() => dropInstant(100)}>+100</Button>
                <Button onClick={() => dropInstant(1000)}>+1000</Button>
                <ResetButton onClick={reset} label="Vaciar" />
              </ControlRow>
              <Slider label="Filas de clavos (n)" value={rows} min={2} max={24} onChange={setRows} />
              <Slider label="Probabilidad de ir a la derecha (p)" value={p} min={0.05} max={0.95} step={0.05} onChange={setP} format={(v) => formatDecimal(v, 2)} />
              <Slider label="Bolas por segundo" value={flow} min={1} max={60} onChange={setFlow} />
              <SpeedControl value={speed} onChange={setSpeed} />
              <Toggle label="Mostrar la curva normal" checked={showNormal} onChange={setShowNormal} />
            </Panel>
            <Panel title="Estadística">
              <StatGrid>
                <Stat label="Media" value={stats.count ? formatDecimal(stats.mean, 2) : '—'} sub={`teoría np = ${formatDecimal(mean, 2)}`} />
                <Stat label="Varianza" value={stats.count ? formatDecimal(stats.variance, 2) : '—'} sub={`teoría np(1−p) = ${formatDecimal(sd * sd, 2)}`} />
              </StatGrid>
            </Panel>
          </>
        }
      />
      <Panel title="Frecuencias frente a la teoría">
        <BarChart
          ariaLabel="Frecuencia relativa por casilla frente a la binomial"
          height={230}
          bars={bars}
          barLabel="Frecuencia simulada"
          barColor={colors.series[1]}
          overlays={[
            { id: 'bin', label: `Binomial B(${rows}, ${formatDecimal(p, 2)})`, color: colors.series[2], points: pmf.map((y, k) => ({ x: k, y })), dots: true },
            ...(showNormal
              ? [
                  {
                    id: 'normal',
                    label: `Normal N(${formatDecimal(mean, 1)}, ${formatDecimal(sd, 2)}²)`,
                    color: colors.series[0],
                    points: Array.from({ length: 121 }, (_, i) => {
                      const x = -0.5 + ((rows + 1) * i) / 120;
                      return { x, y: normalPdf(x, mean, sd) };
                    }),
                  },
                ]
              : []),
          ]}
          xDomain={[-0.5, rows + 0.5]}
          formatY={(v) => `${Math.round(v * 100)} %`}
          xLabel="casilla (nº de rebotes a la derecha)"
        />
      </Panel>
      <Explanation>
        <p>
          Para caer en la casilla k, una bola tiene que rebotar <strong>k veces a la derecha</strong> de n posibles. Hay{' '}
          <span className="formula">C(n, k)</span> caminos distintos que lo consiguen y cada uno ocurre con probabilidad{' '}
          <span className="formula">p<sup>k</sup>(1 − p)<sup>n−k</sup></span>: es la <strong>distribución binomial</strong>. Las casillas del
          centro reciben más bolas simplemente porque hay muchos más caminos que llevan a ellas.
        </p>
        <p>
          El <strong>teorema central del límite</strong> dice que la suma de muchos efectos pequeños e independientes se
          parece a una campana de Gauss con media <span className="formula">np</span> y varianza{' '}
          <span className="formula">np(1 − p)</span>. Con pocas bolas el histograma es irregular; al acumular cientos se
          ajusta a la curva. Con p lejos de 0,5 la binomial se tuerce y la normal la aproxima peor si hay pocas filas.
        </p>
      </Explanation>
    </SimPage>
  );
}
