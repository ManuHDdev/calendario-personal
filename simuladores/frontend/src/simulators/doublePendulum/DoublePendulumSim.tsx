import { useEffect, useRef, useState } from 'react';
import LineChart, { type Point } from '../../components/charts/LineChart';
import { ControlRow, PlayPauseButton, ResetButton, Segmented, Slider, SpeedControl, Stat, StatGrid, Toggle } from '../../components/controls/Controls';
import { Explanation, Panel, SimMain, SimPage, Stage } from '../../components/layout/SimLayout';
import { useAnimationFrame } from '../../hooks/useAnimationFrame';
import { useCanvas } from '../../hooks/useCanvas';
import { useThemeColors } from '../../hooks/useThemeColors';
import { energy, integrate, positions, stateDistance, type PendulumParams, type PendulumState } from '../../lib/doublePendulum';
import { formatDecimal, formatScientific } from '../../lib/format';
import { usePlayback } from '../shared';
import '../sims.css';

const DEG = Math.PI / 180;
const TRAIL = 900;
const DELTAS = [0.001, 0.01, 0.1, 1];

interface World {
  a: PendulumState;
  b: PendulumState;
  time: number;
  e0: number;
  trailA: { x: number; y: number }[];
  trailB: { x: number; y: number }[];
  separation: Point[];
  lastSample: number;
}

export default function DoublePendulumSim() {
  const colors = useThemeColors();
  const { playing, toggle, speed, setSpeed } = usePlayback(1);
  const [m1, setM1] = useState(1);
  const [m2, setM2] = useState(1);
  const [l1, setL1] = useState(1);
  const [l2, setL2] = useState(1);
  const [g, setG] = useState(9.81);
  const [theta1, setTheta1] = useState(120);
  const [theta2, setTheta2] = useState(150);
  const [twin, setTwin] = useState(true);
  const [delta, setDelta] = useState(0.001);
  const [showTrail, setShowTrail] = useState(true);
  const [, setFrame] = useState(0);
  const params: PendulumParams = { m1, m2, l1, l2, g };
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const makeWorld = (): World => {
    const a: PendulumState = { theta1: theta1 * DEG, omega1: 0, theta2: theta2 * DEG, omega2: 0 };
    const b: PendulumState = { ...a, theta2: a.theta2 + delta * DEG };
    return { a, b, time: 0, e0: energy(a, params).total, trailA: [], trailB: [], separation: [], lastSample: -1 };
  };
  const world = useRef<World>(null as unknown as World);
  if (world.current === null) world.current = makeWorld();

  const reset = () => {
    world.current = makeWorld();
    setFrame((f) => f + 1);
  };
  // Initial conditions and parameters define the experiment: changing them restarts it.
  useEffect(reset, [m1, m2, l1, l2, g, theta1, theta2, delta]);

  useAnimationFrame((dt) => {
    const w = world.current;
    const p = paramsRef.current;
    const step = dt * speed;
    w.a = integrate(w.a, p, step, 1 / 1000);
    if (twin) w.b = integrate(w.b, p, step, 1 / 1000);
    w.time += step;
    const pa = positions(w.a, p);
    w.trailA.push({ x: pa.x2, y: pa.y2 });
    if (w.trailA.length > TRAIL) w.trailA.shift();
    if (twin) {
      const pb = positions(w.b, p);
      w.trailB.push({ x: pb.x2, y: pb.y2 });
      if (w.trailB.length > TRAIL) w.trailB.shift();
      if (w.time - w.lastSample >= 0.05) {
        w.lastSample = w.time;
        w.separation.push({ x: w.time, y: Math.max(1e-12, stateDistance(w.a, w.b)) });
        if (w.separation.length > 1200) w.separation = w.separation.filter((_, i) => i % 2 === 0);
      }
    }
    setFrame((f) => f + 1);
  }, playing);

  const { canvasRef, size, getContext } = useCanvas();
  useEffect(() => {
    const ctx = getContext();
    const { width: W, height: H } = size;
    if (!ctx || W < 2) return;
    const w = world.current;
    ctx.fillStyle = colors.canvasBg;
    ctx.fillRect(0, 0, W, H);
    const scale = (Math.min(W, H) / 2) * 0.9 / (l1 + l2);
    const ox = W / 2;
    const oy = H / 2;

    const drawTrail = (trail: { x: number; y: number }[], color: string) => {
      if (!showTrail || trail.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      const chunks = 12;
      const per = Math.ceil(trail.length / chunks);
      for (let c = 0; c < chunks; c++) {
        const from = c * per;
        const to = Math.min(trail.length - 1, (c + 1) * per);
        if (to <= from) continue;
        ctx.globalAlpha = 0.08 + 0.7 * ((c + 1) / chunks) ** 2;
        ctx.beginPath();
        ctx.moveTo(ox + trail[from].x * scale, oy + trail[from].y * scale);
        for (let i = from + 1; i <= to; i++) ctx.lineTo(ox + trail[i].x * scale, oy + trail[i].y * scale);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const drawPendulum = (s: PendulumState, color: string, alpha: number) => {
      const p = positions(s, params);
      const x1 = ox + p.x1 * scale;
      const y1 = oy + p.y1 * scale;
      const x2 = ox + p.x2 * scale;
      const y2 = oy + p.y2 * scale;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = colors.textSecondary;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const r1 = 6 + 4 * Math.cbrt(m1);
      const r2 = 6 + 4 * Math.cbrt(m2);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x1, y1, r1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y2, r2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    // Reference circle of the reachable region.
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ox, oy, (l1 + l2) * scale, 0, Math.PI * 2);
    ctx.stroke();

    drawTrail(w.trailA, colors.series[0]);
    if (twin) drawTrail(w.trailB, colors.series[2]);
    if (twin) drawPendulum(w.b, colors.series[2], 0.9);
    drawPendulum(w.a, colors.series[0], 1);
    ctx.fillStyle = colors.text;
    ctx.beginPath();
    ctx.arc(ox, oy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  const w = world.current;
  const e = energy(w.a, params);
  // Relative to the natural energy scale (m1 + m2)·g·(l1 + l2); E itself can be ≈ 0.
  const drift = Math.abs(e.total - w.e0) / ((m1 + m2) * g * (l1 + l2));
  const sep = twin ? stateDistance(w.a, w.b) : 0;

  return (
    <SimPage
      title="Péndulo doble"
      lead="Dos varillas, dos masas y ni un gramo de azar. Aun así, su movimiento es impredecible: un cambio minúsculo al empezar acaba en una trayectoria completamente distinta."
    >
      <SimMain
        stage={
          <Panel
            title="Simulación"
            actions={
              twin ? (
                <span className="sim-badge sim-badge--neutral">
                  Dos péndulos separados {formatDecimal(delta, 3)}° al empezar
                </span>
              ) : undefined
            }
          >
            <Stage canvasRef={canvasRef} aspect="1 / 1" maxHeight="78vh" label="Péndulo doble con su estela" />
          </Panel>
        }
        side={
          <>
            <Panel title="Controles">
              <ControlRow>
                <PlayPauseButton playing={playing} onToggle={toggle} />
                <ResetButton onClick={reset} />
              </ControlRow>
              <SpeedControl value={speed} onChange={setSpeed} />
              <Slider label="Ángulo inicial 1" value={theta1} min={-180} max={180} onChange={setTheta1} format={(v) => `${v}°`} />
              <Slider label="Ángulo inicial 2" value={theta2} min={-180} max={180} onChange={setTheta2} format={(v) => `${v}°`} />
              <Slider label="Masa 1" value={m1} min={0.2} max={5} step={0.1} onChange={setM1} format={(v) => `${formatDecimal(v, 1)} kg`} />
              <Slider label="Masa 2" value={m2} min={0.2} max={5} step={0.1} onChange={setM2} format={(v) => `${formatDecimal(v, 1)} kg`} />
              <Slider label="Longitud 1" value={l1} min={0.3} max={2} step={0.05} onChange={setL1} format={(v) => `${formatDecimal(v, 2)} m`} />
              <Slider label="Longitud 2" value={l2} min={0.3} max={2} step={0.05} onChange={setL2} format={(v) => `${formatDecimal(v, 2)} m`} />
              <Slider label="Gravedad" value={g} min={1} max={25} step={0.01} onChange={setG} format={(v) => `${formatDecimal(v, 2)} m/s²`} />
              <Toggle label="Segundo péndulo casi idéntico" checked={twin} onChange={setTwin} />
              {twin && (
                <Segmented
                  label="Diferencia inicial en el ángulo 2"
                  value={delta}
                  onChange={setDelta}
                  options={DELTAS.map((d) => ({ value: d, label: `${d.toLocaleString('es-ES')}°` }))}
                />
              )}
              <Toggle label="Estela" checked={showTrail} onChange={setShowTrail} />
            </Panel>
            <Panel title="Medidas">
              <StatGrid>
                <Stat label="Tiempo" value={`${formatDecimal(w.time, 1)} s`} />
                <Stat label="Energía total" value={`${formatDecimal(e.total, 3)} J`} sub={`deriva ${formatScientific(drift, 1)}`} />
                <Stat label="Cinética" value={`${formatDecimal(e.kinetic, 2)} J`} />
                {twin && <Stat label="Distancia entre estados" value={sep >= 0.01 ? formatDecimal(sep, 2) : formatScientific(sep, 1)} color={colors.series[2]} />}
              </StatGrid>
            </Panel>
          </>
        }
      />
      {twin && (
        <Panel title="Divergencia de los dos péndulos">
          <LineChart
            ariaLabel="Distancia entre los dos péndulos frente al tiempo, en escala logarítmica"
            height={230}
            yLog
            yDomain={[1e-6, 20]}
            xDomain={[0, Math.max(10, w.time)]}
            formatY={(v) => formatScientific(v, 0).replace(/^1·/, '').replace(/^10⁰$/, '1')}
            formatX={(v) => `${Math.round(v)} s`}
            xLabel="tiempo"
            series={[{ id: 'sep', label: 'Distancia en el espacio de estados (ángulos y velocidades)', color: colors.series[2], points: w.separation }]}
          />
          <p className="sim-note">
            En escala logarítmica, un crecimiento exponencial es una recta: la pendiente es el exponente de Lyapunov. Cuando
            llega a ~1 ya no se parecen en nada.
          </p>
        </Panel>
      )}
      <Explanation>
        <p>
          Las ecuaciones del péndulo doble salen de la mecánica de Lagrange y son totalmente <strong>deterministas</strong>:
          el mismo estado inicial da siempre el mismo movimiento. Se integran numéricamente con <strong>Runge–Kutta de
          orden 4</strong> en pasos de 1 ms; la energía total apenas se mueve (la deriva mostrada), lo que indica que la
          integración es fiel.
        </p>
        <p>
          Con ángulos pequeños el movimiento es regular. Con ángulos grandes aparece el <strong>caos</strong>: dos estados
          iniciales separados por {formatDecimal(delta, 3)}° se alejan exponencialmente, multiplicando la diferencia por un
          factor constante cada poco tiempo. Predecir a largo plazo exigiría conocer el estado con una precisión infinita.
          Es el famoso <strong>efecto mariposa</strong>.
        </p>
        <p>Prueba ángulos iniciales de 10° y 15°: los dos péndulos irán juntos mucho tiempo.</p>
      </Explanation>
    </SimPage>
  );
}
