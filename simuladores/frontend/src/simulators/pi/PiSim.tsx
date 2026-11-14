import { useEffect, useRef, useState } from 'react';
import LineChart, { type Point } from '../../components/charts/LineChart';
import { ControlRow, PlayPauseButton, ResetButton, Segmented, Slider, Stat, StatGrid } from '../../components/controls/Controls';
import { Explanation, Panel, SimMain, SimPage, Stage } from '../../components/layout/SimLayout';
import { useAnimationFrame } from '../../hooks/useAnimationFrame';
import { useCanvas } from '../../hooks/useCanvas';
import { useThemeColors } from '../../hooks/useThemeColors';
import { formatDecimal, formatInt } from '../../lib/format';
import {
  buffonCrossProbability,
  circleEstimatorSd,
  dropNeedle,
  estimatePiFromBuffon,
  estimatePiFromCircle,
  samplePiPoint,
} from '../../lib/piEstimation';
import { mulberry32, randomSeed, type Rng } from '../../lib/random';
import { usePlayback } from '../shared';
import '../sims.css';

type Mode = 'circle' | 'buffon';

/** Samples kept for redrawing after a resize/theme change. Counting continues beyond. */
const MAX_DRAWN = 40000;
/** Horizontal strips (line spacing = 1 world unit) in Buffon mode. */
const STRIPS = 6;
const RATES = [10, 100, 1000, 10000];

interface Acc {
  total: number;
  hits: number;
  /** Circle: x, y in [−1, 1]. Buffon: x1, y1, x2, y2 in world units. */
  drawn: number[];
  hitFlags: boolean[];
  history: Point[];
  nextCheckpoint: number;
}

const emptyAcc = (): Acc => ({ total: 0, hits: 0, drawn: [], hitFlags: [], history: [], nextCheckpoint: 1 });

export default function PiSim() {
  const colors = useThemeColors();
  const { playing, toggle } = usePlayback();
  const [mode, setMode] = useState<Mode>('circle');
  const [rate, setRate] = useState(100);
  const [ratio, setRatio] = useState(0.8);
  const [, setFrame] = useState(0);
  const rng = useRef<Rng>(mulberry32(randomSeed()));
  const acc = useRef<Acc>(emptyAcc());
  const emit = useRef(0);
  const layer = useRef<HTMLCanvasElement | null>(null);
  const layerDrawn = useRef(0);
  const { canvasRef, size, getContext } = useCanvas();

  const reset = () => {
    acc.current = emptyAcc();
    layerDrawn.current = 0;
    layer.current = null;
    setFrame((f) => f + 1);
  };
  useEffect(reset, [mode, ratio]);

  // Geometry shared by drawing and sampling.
  const geom = () => {
    const { width: W, height: H } = size;
    if (mode === 'circle') {
      const side = Math.min(W, H) - 28;
      return { W, H, side, ox: (W - side) / 2, oy: (H - side) / 2, unit: 0, worldW: 0 };
    }
    const unit = (H - 20) / STRIPS;
    return { W, H, side: 0, ox: 0, oy: 10, unit, worldW: W / unit };
  };

  const estimate = (a: Acc) =>
    mode === 'circle' ? estimatePiFromCircle(a.hits, a.total) : estimatePiFromBuffon(ratio, 1, a.total, a.hits);

  const sample = (k: number) => {
    const a = acc.current;
    const g = geom();
    for (let i = 0; i < k; i++) {
      if (mode === 'circle') {
        const pt = samplePiPoint(rng.current);
        a.total++;
        if (pt.inside) a.hits++;
        if (a.hitFlags.length < MAX_DRAWN) {
          a.drawn.push(pt.x, pt.y);
          a.hitFlags.push(pt.inside);
        }
      } else {
        const nd = dropNeedle(rng.current, Math.max(1, g.worldW), STRIPS, ratio, 1);
        a.total++;
        if (nd.crosses) a.hits++;
        if (a.hitFlags.length < MAX_DRAWN) {
          a.drawn.push(nd.x1, nd.y1, nd.x2, nd.y2);
          a.hitFlags.push(nd.crosses);
        }
      }
      if (a.total >= a.nextCheckpoint) {
        a.history.push({ x: a.total, y: estimate(a) });
        a.nextCheckpoint = Math.max(a.total + 1, Math.ceil(a.total * 1.04));
      }
    }
  };

  useAnimationFrame((dt) => {
    emit.current += dt * rate;
    const k = Math.floor(emit.current);
    if (k > 0) {
      emit.current -= k;
      sample(k);
      setFrame((f) => f + 1);
    }
  }, playing && size.width > 2);

  // ── Drawing: samples go to an offscreen layer once, the frame composites it ──
  useEffect(() => {
    const ctx = getContext();
    const g = geom();
    if (!ctx || g.W < 2) return;
    const dpr = size.dpr;
    const pxW = Math.round(g.W * dpr);
    const pxH = Math.round(g.H * dpr);
    if (!layer.current || layer.current.width !== pxW || layer.current.height !== pxH) {
      layer.current = document.createElement('canvas');
      layer.current.width = pxW;
      layer.current.height = pxH;
      layerDrawn.current = 0;
    }
    const lctx = layer.current.getContext('2d')!;
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const a = acc.current;
    const from = layerDrawn.current;
    const to = a.hitFlags.length;
    if (mode === 'circle') {
      const r = Math.max(1.2, Math.min(3, g.side / 190));
      const half = g.side / 2;
      for (let i = from; i < to; i++) {
        lctx.fillStyle = a.hitFlags[i] ? colors.accent : colors.textTertiary;
        lctx.globalAlpha = a.hitFlags[i] ? 0.85 : 0.7;
        lctx.fillRect(g.ox + half + a.drawn[2 * i] * half - r / 2, g.oy + half - a.drawn[2 * i + 1] * half - r / 2, r, r);
      }
    } else {
      lctx.lineWidth = 1.2;
      for (let i = from; i < to; i++) {
        lctx.strokeStyle = a.hitFlags[i] ? colors.accent : colors.textTertiary;
        lctx.globalAlpha = a.hitFlags[i] ? 0.8 : 0.5;
        lctx.beginPath();
        lctx.moveTo(a.drawn[4 * i] * g.unit, g.oy + a.drawn[4 * i + 1] * g.unit);
        lctx.lineTo(a.drawn[4 * i + 2] * g.unit, g.oy + a.drawn[4 * i + 3] * g.unit);
        lctx.stroke();
      }
    }
    lctx.globalAlpha = 1;
    layerDrawn.current = to;

    ctx.fillStyle = colors.canvasBg;
    ctx.fillRect(0, 0, g.W, g.H);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer.current, 0, 0);
    ctx.restore();
    if (mode === 'buffon') {
      // The floor lines go on top so they stay visible under thousands of needles.
      ctx.strokeStyle = colors.text;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.5;
      for (let s = 0; s <= STRIPS; s++) {
        ctx.beginPath();
        ctx.moveTo(0, g.oy + s * g.unit);
        ctx.lineTo(g.W, g.oy + s * g.unit);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (mode === 'circle') {
      ctx.strokeStyle = colors.textSecondary;
      ctx.lineWidth = 1;
      ctx.strokeRect(g.ox, g.oy, g.side, g.side);
      ctx.beginPath();
      ctx.arc(g.ox + g.side / 2, g.oy + g.side / 2, g.side / 2, 0, Math.PI * 2);
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });

  // Theme change: repaint all stored samples with the new colours.
  useEffect(() => {
    layerDrawn.current = 0;
    layer.current = null;
    setFrame((f) => f + 1);
  }, [colors]);

  const a = acc.current;
  const est = estimate(a);
  const err = Math.abs(est - Math.PI);
  const pCross = buffonCrossProbability(ratio, 1);
  const sdAt = (n: number) => (mode === 'circle' ? circleEstimatorSd(n) : Math.PI * Math.sqrt((1 - pCross) / (n * pCross)));
  const bandX = a.history.map((h) => h.x).filter((x) => x >= 5);
  const band = {
    lower: bandX.map((x) => ({ x, y: Math.PI - 2 * sdAt(x) })),
    upper: bandX.map((x) => ({ x, y: Math.PI + 2 * sdAt(x) })),
    color: colors.series[0],
  };
  const correctDigits = Number.isFinite(est) && err > 0 ? Math.max(0, Math.floor(-Math.log10(err / 0.5))) : 0;

  return (
    <SimPage
      title="Estimación de π"
      lead="El azar también sirve para medir. Lanza puntos o agujas al azar y cuenta: π aparece solo, cada vez más preciso, aunque muy despacio."
    >
      <SimMain
        stage={
          <Panel
            actions={
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'circle', label: 'Puntos en un cuadrado' },
                  { value: 'buffon', label: 'Aguja de Buffon' },
                ]}
              />
            }
          >
            <Stage
              canvasRef={canvasRef}
              aspect={mode === 'circle' ? '1 / 1' : '4 / 3'}
              maxHeight="76vh"
              label={mode === 'circle' ? 'Puntos aleatorios en un cuadrado con un círculo inscrito' : 'Agujas lanzadas sobre líneas paralelas'}
            />
            {a.total > MAX_DRAWN && <p className="sim-note">Se dibujan las primeras {formatInt(MAX_DRAWN)} muestras; el recuento sigue con todas.</p>}
          </Panel>
        }
        side={
          <>
            <Panel title="Controles">
              <ControlRow>
                <PlayPauseButton playing={playing} onToggle={toggle} />
                <ResetButton onClick={reset} />
              </ControlRow>
              <Segmented label="Muestras por segundo" value={rate} onChange={setRate} options={RATES.map((r) => ({ value: r, label: formatInt(r) }))} />
              {mode === 'buffon' && (
                <Slider
                  label="Longitud de la aguja (l / t)"
                  value={ratio}
                  min={0.1}
                  max={1}
                  step={0.05}
                  onChange={setRatio}
                  format={(v) => formatDecimal(v, 2)}
                  hint="t es la separación entre líneas."
                />
              )}
            </Panel>
            <Panel title="Estimación">
              <StatGrid>
                <Stat label="π estimado" value={Number.isFinite(est) ? formatDecimal(est, 5) : '—'} sub={`π = ${formatDecimal(Math.PI, 5)}`} color={colors.accent} />
                <Stat label="Error" value={Number.isFinite(est) ? formatDecimal(err, 5) : '—'} sub={`${correctDigits} decimales correctos`} />
                <Stat label={mode === 'circle' ? 'Puntos' : 'Agujas'} value={formatInt(a.total)} />
                <Stat
                  label={mode === 'circle' ? 'Dentro del círculo' : 'Cortan una línea'}
                  value={formatInt(a.hits)}
                  sub={a.total ? `${formatDecimal((a.hits / a.total) * 100, 2)} % (teoría ${formatDecimal((mode === 'circle' ? Math.PI / 4 : pCross) * 100, 2)} %)` : undefined}
                />
              </StatGrid>
            </Panel>
          </>
        }
      />
      <Panel title="Convergencia">
        <LineChart
          ariaLabel="Estimación de π frente al número de muestras"
          height={240}
          xLog
          xDomain={[1, Math.max(100, a.total)]}
          yDomain={[2.6, 3.7]}
          formatY={(v) => formatDecimal(v, 1)}
          xLabel="muestras (escala logarítmica)"
          series={[{ id: 'est', label: 'Estimación', color: colors.accent, points: a.history }]}
          bands={[band]}
          refLines={[{ axis: 'y', value: Math.PI, label: 'π', color: colors.text }]}
        />
        <p className="sim-note">La franja sombreada es π ± 2 desviaciones típicas: se estrecha como 1/√N.</p>
      </Panel>
      <Explanation>
        {mode === 'circle' ? (
          <p>
            Un círculo de radio 1 ocupa <strong>π/4 ≈ 78,5 %</strong> del cuadrado de lado 2 que lo contiene. Si los puntos
            caen uniformemente, la fracción que queda dentro se acerca a π/4, así que{' '}
            <span className="formula">π ≈ 4 · dentro / total</span>.
          </p>
        ) : (
          <p>
            Georges-Louis Leclerc, conde de Buffon, se preguntó en 1777 con qué probabilidad una aguja de longitud l, lanzada
            sobre un suelo de tablas de anchura t ≥ l, cae cruzando una junta. La respuesta es{' '}
            <span className="formula">P = 2l / (πt)</span>, así que contando cruces se despeja{' '}
            <span className="formula">π ≈ 2l·N / (t·cruces)</span>. La dirección de cada aguja se sortea sin usar π: se
            elige un punto al azar en el disco unidad.
          </p>
        )}
        <p>
          Es el <strong>método de Montecarlo</strong>: la ley de los grandes números garantiza que la estimación converge,
          pero el error típico solo baja como <span className="formula">1/√N</span>. Cada decimal correcto más exige unas 100
          veces más muestras; por eso la curva tiembla durante mucho tiempo alrededor de π.
        </p>
      </Explanation>
    </SimPage>
  );
}
