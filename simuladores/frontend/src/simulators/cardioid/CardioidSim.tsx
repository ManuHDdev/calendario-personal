import { useEffect, useRef, useState } from 'react';
import {
  Button,
  ControlRow,
  PlayPauseButton,
  ResetButton,
  Segmented,
  Slider,
  SpeedControl,
  Stat,
  StatGrid,
  Toggle,
} from '../../components/controls/Controls';
import { Explanation, Panel, SimMain, SimPage, Stage } from '../../components/layout/SimLayout';
import { useAnimationFrame } from '../../hooks/useAnimationFrame';
import { useCanvas } from '../../hooks/useCanvas';
import { useThemeColors } from '../../hooks/useThemeColors';
import { circlePoint, epicycloidPoint, knownShapeName, rollingCircleTurnsPerOrbit, timesTableEnvelopePoint } from '../../lib/cardioid';
import { formatDecimal } from '../../lib/format';
import { usePlayback } from '../shared';
import '../sims.css';

type Mode = 'table' | 'rolling';

const PRESETS = [2, 3, 4, 5, 9, 21, 34, 51, 99];

export default function CardioidSim() {
  const colors = useThemeColors();
  const { playing, toggle, speed, setSpeed } = usePlayback(1);
  const [mode, setMode] = useState<Mode>('table');
  const [points, setPoints] = useState(200);
  const [k, setK] = useState(2);
  const [showEnvelope, setShowEnvelope] = useState(false);
  const [cusps, setCusps] = useState(1);
  const [, setFrame] = useState(0);
  const kRef = useRef(k);
  kRef.current = k;
  const tRef = useRef(0);
  const { canvasRef, size, getContext } = useCanvas();

  useAnimationFrame((dt) => {
    if (mode === 'table') {
      const next = kRef.current + dt * speed * 0.12;
      setK(next > 100 ? 0 : Math.round(next * 1000) / 1000);
    } else {
      tRef.current += dt * speed * 0.7;
      setFrame((f) => f + 1);
    }
  }, playing);

  useEffect(() => {
    tRef.current = 0;
    setFrame((f) => f + 1);
  }, [cusps]);

  // ── Drawing ──────────────────────────────────────────────────────────────
  function drawTable(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const R = Math.min(w, h) * 0.44;
    const cx = w / 2;
    const cy = h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.strokeStyle = colors.borderStrong;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
    ctx.lineWidth = points > 300 ? 0.6 : points > 150 ? 0.85 : 1.1;
    const alpha = colors.dark ? 0.55 : 0.6;
    for (let i = 0; i < points; i++) {
      const to = (((k * i) % points) + points) % points;
      const a = circlePoint(i, points, R);
      const b = circlePoint(to, points, R);
      const hue = 255 + (i / points) * 300;
      ctx.strokeStyle = `hsla(${hue % 360}, ${colors.dark ? 85 : 70}%, ${colors.dark ? 60 : 50}%, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    if (points <= 120) {
      ctx.fillStyle = colors.textSecondary;
      for (let i = 0; i < points; i++) {
        const p = circlePoint(i, points, R);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const nearest = Math.round(k);
    if (showEnvelope && nearest >= 2 && Math.abs(k - nearest) < 0.05) {
      ctx.beginPath();
      for (let s = 0; s <= 720; s++) {
        const p = timesTableEnvelopePoint(nearest, R, (s / 720) * Math.PI * 2);
        if (s === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = colors.text;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawRolling(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const unit = Math.min(w, h) * 0.46;
    const r = unit / (cusps + 2);
    const R = cusps * r;
    const t = tRef.current;
    const cx = w / 2;
    const cy = h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    // Flip y so angles grow counter-clockwise like in the formulas.
    ctx.scale(1, -1);

    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = colors.bgTertiary;
    ctx.fill();
    ctx.strokeStyle = colors.borderStrong;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const TAU = Math.PI * 2;
    const lap = Math.floor(t / TAU);
    const tracePath = (from: number, to: number) => {
      ctx.beginPath();
      const steps = Math.max(2, Math.ceil((to - from) * 90));
      for (let s = 0; s <= steps; s++) {
        const p = epicycloidPoint(R, r, from + ((to - from) * s) / steps);
        if (s === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
    };
    if (lap > 0) {
      tracePath(0, TAU);
      ctx.strokeStyle = colors.accent;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    tracePath(lap * TAU, t);
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Rolling circle, its centre and a spoke that shows its own rotation.
    const ccx = (R + r) * Math.cos(t);
    const ccy = (R + r) * Math.sin(t);
    ctx.beginPath();
    ctx.arc(ccx, ccy, r, 0, TAU);
    ctx.strokeStyle = colors.series[1];
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = colors.dark ? 'rgba(100,181,255,0.08)' : 'rgba(10,132,255,0.06)';
    ctx.fill();

    const p = epicycloidPoint(R, r, t);
    ctx.beginPath();
    ctx.moveTo(ccx, ccy);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = colors.textSecondary;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // A second spoke at 90° makes the spin easy to follow.
    const spin = ((R + r) / r) * t;
    ctx.beginPath();
    ctx.moveTo(ccx, ccy);
    ctx.lineTo(ccx + r * Math.cos(spin + Math.PI / 2 + Math.PI), ccy + r * Math.sin(spin + Math.PI / 2 + Math.PI));
    ctx.strokeStyle = colors.border;
    ctx.stroke();

    // Contact point between the circles.
    ctx.beginPath();
    ctx.arc(R * Math.cos(t), R * Math.sin(t), 3, 0, TAU);
    ctx.fillStyle = colors.textSecondary;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ccx, ccy, 2.5, 0, TAU);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, 9, 0, TAU);
    ctx.fillStyle = colors.accent;
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  useEffect(() => {
    const ctx = getContext();
    if (!ctx || size.width < 2) return;
    ctx.fillStyle = colors.canvasBg;
    ctx.fillRect(0, 0, size.width, size.height);
    if (mode === 'table') drawTable(ctx, size.width, size.height);
    else drawRolling(ctx, size.width, size.height);
  });

  const shape = knownShapeName(k);
  const turnsPerOrbit = rollingCircleTurnsPerOrbit(cusps, 1);
  const rollingName = cusps === 1 ? 'Cardioide' : cusps === 2 ? 'Nefroide' : `Epicicloide de ${cusps} cúspides`;
  const t = tRef.current;

  const overlay =
    mode === 'table' ? (
      <div className="cardioid-label">
        <span className="num">k = {formatDecimal(k, 2)}</span>
        <strong className={shape ? 'cardioid-shape cardioid-shape--on' : 'cardioid-shape'}>{shape ?? ' '}</strong>
      </div>
    ) : (
      <div className="cardioid-label">
        <strong className="cardioid-shape cardioid-shape--on">{rollingName}</strong>
      </div>
    );

  return (
    <SimPage
      title="Cardioide"
      lead="La misma curva aparece de dos maneras muy distintas: uniendo puntos de un círculo según una tabla de multiplicar, y siguiendo un punto de una moneda que rueda alrededor de otra."
    >
      <SimMain
        stage={
          <Panel
            actions={
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'table', label: 'Tabla de multiplicar' },
                  { value: 'rolling', label: 'Círculo rodante' },
                ]}
              />
            }
          >
            <Stage
              canvasRef={canvasRef}
              aspect="1 / 1"
              maxHeight="78vh"
              label={mode === 'table' ? `Tabla del ${formatDecimal(k, 2)} sobre ${points} puntos` : `${rollingName} trazado por un círculo rodante`}
              overlay={overlay}
            />
          </Panel>
        }
        side={
          <>
            <Panel title="Controles">
              <ControlRow>
                <PlayPauseButton playing={playing} onToggle={toggle} />
                <ResetButton
                  onClick={() => {
                    if (mode === 'table') setK(2);
                    else tRef.current = 0;
                    setFrame((f) => f + 1);
                  }}
                />
              </ControlRow>
              <SpeedControl value={speed} onChange={setSpeed} />
              {mode === 'table' ? (
                <>
                  <Slider label="Puntos (N)" value={points} min={10} max={500} step={1} onChange={setPoints} />
                  <Slider
                    label="Multiplicador (k)"
                    value={k}
                    min={0}
                    max={100}
                    step={0.01}
                    onChange={setK}
                    format={(v) => formatDecimal(v, 2)}
                    hint="Al reproducir, k avanza despacio y la figura se transforma."
                  />
                  <div className="cardioid-presets">
                    {PRESETS.map((p) => (
                      <Button key={p} variant={Math.abs(k - p) < 0.005 ? 'primary' : 'secondary'} onClick={() => setK(p)}>
                        ×{p}
                      </Button>
                    ))}
                  </div>
                  <Toggle label="Mostrar la envolvente teórica" checked={showEnvelope} onChange={setShowEnvelope} />
                </>
              ) : (
                <Slider
                  label="Cúspides"
                  value={cusps}
                  min={1}
                  max={8}
                  onChange={setCusps}
                  hint={`Círculo fijo ${cusps} veces más grande que el que rueda.`}
                />
              )}
            </Panel>
            <Panel title="Datos">
              {mode === 'table' ? (
                <StatGrid>
                  <Stat label="Segmentos" value={points} sub={`i → ${formatDecimal(k, 2)}·i mod ${points}`} />
                  <Stat label="Cúspides (k entero)" value={Math.round(k) >= 2 ? Math.round(k) - 1 : '—'} sub="k − 1" />
                </StatGrid>
              ) : (
                <StatGrid>
                  <Stat label="Vueltas alrededor" value={formatDecimal(t / (2 * Math.PI), 2)} />
                  <Stat
                    label="Giros de la moneda"
                    value={formatDecimal((t / (2 * Math.PI)) * turnsPerOrbit, 2)}
                    sub={`${turnsPerOrbit} por vuelta`}
                  />
                </StatGrid>
              )}
            </Panel>
          </>
        }
      />
      <Explanation>
        {mode === 'table' ? (
          <>
            <p>
              Se reparten <strong>N puntos</strong> en un círculo y se une cada punto <span className="formula">i</span> con el
              punto <span className="formula">k·i mod N</span>. Ninguna línea es curva, pero juntas dibujan una: su
              <strong> envolvente</strong>.
            </p>
            <p>
              Con k = 2 aparece la <strong>cardioide</strong> (con forma de corazón), con k = 3 la <strong>nefroide</strong> (de
              riñón) y, en general, con k entero una epicicloide de k − 1 cúspides. Entre valores enteros la figura se
              deshace y se recompone; con k cerca de N/2 o N − 1 surgen simetrías nuevas (prueba ×51 o ×99 con 100 o 200
              puntos).
            </p>
            <p>
              Activa la envolvente teórica con k entero: la curva discontinua es exactamente la que traza el modo
              «Círculo rodante».
            </p>
          </>
        ) : (
          <>
            <p>
              Una moneda de radio r rueda sin deslizar alrededor de otra de radio R. Un punto de su borde traza una
              <strong> epicicloide</strong> con R/r cúspides: con monedas iguales sale la <strong>cardioide</strong>.
            </p>
            <p>
              <strong>Paradoja de la moneda:</strong> aunque las monedas sean iguales, la que rueda da{' '}
              <span className="formula">(R + r)/r = 2</span> vueltas sobre sí misma por cada vuelta alrededor, no una. Su
              centro recorre un círculo de radio R + r, no R.
            </p>
          </>
        )}
      </Explanation>
    </SimPage>
  );
}
