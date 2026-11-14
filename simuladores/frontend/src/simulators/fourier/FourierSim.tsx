import { useEffect, useMemo, useRef, useState } from 'react';
import BarChart from '../../components/charts/BarChart';
import LineChart from '../../components/charts/LineChart';
import { ControlRow, PlayPauseButton, ResetButton, Segmented, Slider, SpeedControl, Stat, StatGrid, Toggle } from '../../components/controls/Controls';
import { ChartGrid, Explanation, Panel, SimMain, SimPage, Stage } from '../../components/layout/SimLayout';
import { useAnimationFrame } from '../../hooks/useAnimationFrame';
import { useCanvas } from '../../hooks/useCanvas';
import { useThemeColors } from '../../hooks/useThemeColors';
import { epicycleChain, harmonics, idealWave, maxOfPartialSum, partialSum, type WaveType } from '../../lib/fourier';
import { formatDecimal } from '../../lib/format';
import { usePlayback } from '../shared';
import '../sims.css';

const WAVE_NAMES: Record<WaveType, string> = {
  square: 'Cuadrada',
  sawtooth: 'Diente de sierra',
  triangle: 'Triangular',
};

export default function FourierSim() {
  const colors = useThemeColors();
  const { playing, toggle, speed, setSpeed } = usePlayback(1);
  const [wave, setWave] = useState<WaveType>('square');
  const [count, setCount] = useState(5);
  const [showIdeal, setShowIdeal] = useState(true);
  const [, setFrame] = useState(0);
  const tRef = useRef(0);
  const { canvasRef, size, getContext } = useCanvas();
  const terms = useMemo(() => harmonics(wave, count), [wave, count]);

  useAnimationFrame((dt) => {
    tRef.current += dt * speed * 1.1;
    setFrame((f) => f + 1);
  }, playing);

  useEffect(() => {
    const ctx = getContext();
    const { width: W, height: H } = size;
    if (!ctx || W < 2) return;
    ctx.fillStyle = colors.canvasBg;
    ctx.fillRect(0, 0, W, H);
    const narrow = W < 520;
    const cx = W * (narrow ? 0.25 : 0.22);
    const cy = H / 2;
    const amp = Math.min(H * 0.3, W * (narrow ? 0.17 : 0.16));
    const x0 = W * (narrow ? 0.5 : 0.44);
    const span = 3 * Math.PI;
    const pxPerRad = (W - x0 - 12) / span;
    const t = tRef.current;

    // Axes of the wave plot.
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    for (const v of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.moveTo(x0, cy - v * amp);
      ctx.lineTo(W - 8, cy - v * amp);
      ctx.stroke();
    }

    // Ideal wave and partial sum, newest value at x0, older ones to the right.
    const plot = (f: (tau: number) => number, color: string, width: number, alpha: number) => {
      ctx.beginPath();
      const steps = Math.ceil(W - x0);
      for (let i = 0; i <= steps; i++) {
        const tau = t - i / pxPerRad;
        const y = cy - f(tau) * amp;
        if (i === 0) ctx.moveTo(x0 + i, y);
        else ctx.lineTo(x0 + i, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.globalAlpha = alpha;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    if (showIdeal) plot((tau) => idealWave(wave, tau), colors.textTertiary, 1.5, 0.8);
    plot((tau) => partialSum(terms, tau), colors.accent, 2.4, 1);

    // Epicycles.
    const chain = epicycleChain(terms, t, amp);
    ctx.save();
    ctx.translate(cx, cy);
    chain.forEach((c, i) => {
      if (i === chain.length - 1 || c.r < 0.4) return;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.strokeStyle = colors.series[1];
      ctx.globalAlpha = i === 0 ? 0.5 : 0.28;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
      const nx = chain[i + 1];
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(nx.x, nx.y);
      ctx.strokeStyle = colors.textSecondary;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    });
    const tip = chain[chain.length - 1];
    ctx.restore();

    // Link from the tip to the start of the trace.
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = colors.textTertiary;
    ctx.beginPath();
    ctx.moveTo(cx + tip.x, cy + tip.y);
    ctx.lineTo(x0, cy + tip.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colors.accent;
    for (const [x, y, r] of [
      [cx + tip.x, cy + tip.y, 4],
      [x0, cy + tip.y, 3.5],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const periodPlot = useMemo(() => {
    const pts = [];
    const ideal = [];
    let sq = 0;
    const M = 600;
    for (let i = 0; i <= M; i++) {
      const tt = -Math.PI + (2 * Math.PI * i) / M;
      const v = partialSum(terms, tt);
      const f = idealWave(wave, tt);
      pts.push({ x: tt, y: v });
      ideal.push({ x: tt, y: f });
      sq += (v - f) ** 2;
    }
    return { pts, ideal, rms: Math.sqrt(sq / (M + 1)) };
  }, [terms, wave]);
  const peak = useMemo(() => maxOfPartialSum(terms, 6000), [terms]);
  const spectrum = terms.map((h) => ({ x: h.freq, value: Math.abs(h.amplitude) }));
  const hasJump = wave !== 'triangle';

  return (
    <SimPage
      title="Series de Fourier"
      lead="Cualquier onda periódica se puede construir sumando senos. Cada círculo que gira es uno de esos senos; la punta del último dibuja la suma."
    >
      <SimMain
        stage={
          <Panel title={`Onda ${WAVE_NAMES[wave].toLowerCase()} con ${count} ${count === 1 ? 'armónico' : 'armónicos'}`}>
            <Stage canvasRef={canvasRef} aspect="2 / 1" label="Epiciclos girando y la onda que dibujan" />
            <p className="sim-note">En morado, la suma parcial; en gris, la onda ideal a la que se acerca.</p>
          </Panel>
        }
        side={
          <>
            <Panel title="Controles">
              <ControlRow>
                <PlayPauseButton playing={playing} onToggle={toggle} />
                <ResetButton
                  onClick={() => {
                    tRef.current = 0;
                    setFrame((f) => f + 1);
                  }}
                />
              </ControlRow>
              <Segmented
                label="Onda"
                value={wave}
                onChange={setWave}
                options={(Object.keys(WAVE_NAMES) as WaveType[]).map((w) => ({ value: w, label: WAVE_NAMES[w] }))}
              />
              <Slider label="Armónicos" value={count} min={1} max={60} onChange={setCount} hint="Número de círculos (términos no nulos de la serie)." />
              <SpeedControl value={speed} onChange={setSpeed} />
              <Toggle label="Mostrar la onda ideal" checked={showIdeal} onChange={setShowIdeal} />
            </Panel>
            <Panel title="Calidad de la aproximación">
              <StatGrid>
                <Stat label="Error cuadrático medio" value={formatDecimal(periodPlot.rms, 4)} />
                <Stat
                  label="Valor máximo"
                  value={formatDecimal(peak, 3)}
                  sub={hasJump ? `sobrepasa en ${formatDecimal((peak - 1) * 50, 1)} % del salto` : 'sin salto: no hay Gibbs'}
                />
              </StatGrid>
            </Panel>
          </>
        }
      />
      <ChartGrid>
        <Panel title="Un periodo completo">
          <LineChart
            ariaLabel="Suma parcial frente a la onda ideal en un periodo"
            height={220}
            xDomain={[-Math.PI, Math.PI]}
            yDomain={[-1.35, 1.35]}
            formatX={(v) => (Math.abs(v) < 1e-9 ? '0' : formatDecimal(v, 1))}
            xLabel="t"
            series={[
              { id: 'ideal', label: 'Onda ideal', color: colors.textTertiary, points: periodPlot.ideal, width: 1.5 },
              { id: 'sum', label: `Suma de ${count} términos`, color: colors.accent, points: periodPlot.pts },
            ]}
            refLines={hasJump ? [{ axis: 'y', value: peak, label: `máx ${formatDecimal(peak, 3)}`, color: colors.danger }] : []}
            maxPoints={600}
          />
        </Panel>
        <Panel title="Espectro: amplitud de cada armónico">
          <BarChart
            ariaLabel="Amplitud de cada armónico"
            height={220}
            bars={spectrum}
            barLabel="|aₖ|"
            barColor={colors.series[1]}
            xLabel="frecuencia k"
            xDomain={[0.5, Math.max(...spectrum.map((b) => b.x)) + 0.5]}
            formatY={(v) => formatDecimal(v, 2)}
          />
        </Panel>
      </ChartGrid>
      <Explanation>
        <p>
          Fourier demostró que una función periódica razonable es una suma de senos y cosenos de frecuencias múltiplos de la
          fundamental. La onda cuadrada, por ejemplo, es{' '}
          <span className="formula">(4/π)·(sen t + sen 3t/3 + sen 5t/5 + …)</span>. Cada término es un círculo de radio igual
          a su amplitud que gira k veces más rápido que el primero; poner un círculo en el borde del anterior suma los
          términos.
        </p>
        <p>
          Cuanto más suaves son los cambios de la onda, más rápido decrecen las amplitudes: la triangular (con picos pero sin
          saltos) baja como <span className="formula">1/k²</span> y con pocos términos ya es casi perfecta; la cuadrada y la
          de sierra (con saltos) bajan como <span className="formula">1/k</span>.
        </p>
        <p>
          <strong>Fenómeno de Gibbs:</strong> junto a un salto, la suma parcial siempre se pasa alrededor de un{' '}
          <strong>9 %</strong> de la altura del salto, por muchos términos que añadas. La oscilación se estrecha y se pega al
          salto, pero su altura no baja: sube el número de armónicos y fíjate en el valor máximo.
        </p>
      </Explanation>
    </SimPage>
  );
}
