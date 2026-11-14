import { useEffect, useMemo, useRef, useState } from 'react';
import LineChart, { type Point } from '../../components/charts/LineChart';
import {
  Button,
  ControlRow,
  PlayPauseButton,
  ResetButton,
  Slider,
  SpeedControl,
  Stat,
  StatGrid,
  StepButton,
  Toggle,
} from '../../components/controls/Controls';
import { Explanation, Panel, SimMain, SimPage, Stage } from '../../components/layout/SimLayout';
import { useAnimationFrame } from '../../hooks/useAnimationFrame';
import { useBatchRunner } from '../../hooks/useBatchRunner';
import { useCanvas } from '../../hooks/useCanvas';
import { useThemeColors } from '../../hooks/useThemeColors';
import { formatDecimal, formatInt, formatPercent } from '../../lib/format';
import { mulberry32, randomSeed, type Rng } from '../../lib/random';
import {
  argMax,
  optimalCutoff,
  randomScores,
  successfulCutoffRange,
  theoreticalSecretarySuccess,
} from '../../lib/secretary';
import { roundRectPath, usePlayback } from '../shared';
import '../sims.css';

interface Round {
  scores: number[];
  /** Candidates already seen. */
  arrived: number;
  /** Seconds since the last arrival (drives the bar growth). */
  timer: number;
  threshold: number;
  chosen: number | null;
  done: boolean;
}

const ARRIVAL = 0.55;
const HOLD = 2.4;

export default function SecretarySim() {
  const colors = useThemeColors();
  const { playing, setPlaying, toggle, speed, setSpeed } = usePlayback(1);
  const [n, setN] = useState(20);
  const [r, setR] = useState(() => Math.round(20 / Math.E));
  const [auto, setAuto] = useState(true);
  const [, setFrame] = useState(0);
  const rng = useRef<Rng>(mulberry32(randomSeed()));
  const tally = useRef({ rounds: 0, wins: 0 });

  const newRound = (): Round => ({
    scores: randomScores(n, rng.current),
    arrived: 0,
    timer: 0,
    threshold: -Infinity,
    chosen: null,
    done: false,
  });
  const round = useRef<Round>(null as unknown as Round);
  if (round.current === null) round.current = newRound();

  const restart = () => {
    round.current = newRound();
    setFrame((f) => f + 1);
  };

  useEffect(() => {
    if (r > n - 1) setR(n - 1);
    tally.current = { rounds: 0, wins: 0 };
    restart();
  }, [n]);

  useEffect(() => {
    tally.current = { rounds: 0, wins: 0 };
    restart();
  }, [r]);

  /** One candidate walks in. Returns false once the round is over. */
  const arrive = () => {
    const rd = round.current;
    if (rd.done) return false;
    const i = rd.arrived;
    rd.arrived++;
    rd.timer = 0;
    if (i < r) {
      rd.threshold = Math.max(rd.threshold, rd.scores[i]);
    } else if (rd.scores[i] > rd.threshold || i === n - 1) {
      rd.chosen = i;
    }
    if (rd.chosen !== null) {
      rd.done = true;
      tally.current.rounds++;
      if (rd.chosen === argMax(rd.scores)) tally.current.wins++;
    }
    return true;
  };

  useAnimationFrame((dt) => {
    const rd = round.current;
    rd.timer += dt * speed;
    if (!rd.done && rd.timer >= ARRIVAL) arrive();
    else if (rd.done && rd.timer >= HOLD) {
      if (auto) round.current = newRound();
      else setPlaying(false);
    }
    setFrame((f) => f + 1);
  }, playing);

  // ── Monte Carlo over every cutoff at once ────────────────────────────────
  const mc = useRef({ trials: 0, wins: new Array<number>(n).fill(0) });
  const mcRng = useRef<Rng>(mulberry32(randomSeed()));
  const runner = useBatchRunner((k) => {
    const s = mc.current;
    for (let t = 0; t < k; t++) {
      const [lo, hi] = successfulCutoffRange(randomScores(n, mcRng.current));
      for (let c = lo; c <= hi; c++) s.wins[c]++;
      s.trials++;
    }
  });
  useEffect(() => {
    runner.cancel();
    mc.current = { trials: 0, wins: new Array<number>(n).fill(0) };
    setFrame((f) => f + 1);
  }, [n]);

  const theory = useMemo(() => Array.from({ length: n }, (_, c) => ({ x: c / n, y: theoreticalSecretarySuccess(n, c) })), [n]);
  const rStar = useMemo(() => optimalCutoff(n), [n]);
  const s = mc.current;
  const empirical: Point[] = s.trials && s.wins.length === n ? s.wins.map((w, c) => ({ x: c / n, y: w / s.trials })) : [];
  const bestEmpirical = s.trials && s.wins.length === n ? s.wins.indexOf(Math.max(...s.wins)) : null;

  // ── Drawing ──────────────────────────────────────────────────────────────
  const { canvasRef, size, getContext } = useCanvas();
  useEffect(() => {
    const ctx = getContext();
    const { width: W, height: H } = size;
    const rd = round.current;
    if (!ctx || W < 2 || rd.scores.length !== n) return;
    ctx.fillStyle = colors.canvasBg;
    ctx.fillRect(0, 0, W, H);

    const padX = 12;
    const top = 34;
    const bottom = H - 26;
    const slot = (W - 2 * padX) / n;
    const bw = Math.max(2, slot * 0.72);
    const hMax = bottom - top - 8;
    const xOf = (i: number) => padX + slot * i + slot / 2;
    const yOf = (score: number) => bottom - (score / n) * hMax;
    const best = argMax(rd.scores);

    // Look phase region.
    if (r > 0) {
      roundRectPath(ctx, padX - 4, 6, slot * r + 8, H - 12, 10);
      ctx.fillStyle = colors.dark ? 'rgba(100,181,255,0.08)' : 'rgba(10,132,255,0.06)';
      ctx.fill();
    }
    ctx.font = '600 12px -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = colors.series[1];
    if (r > 0 && slot * r > 60) ctx.fillText(`Observar (${r})`, padX + 4, 20);
    ctx.fillStyle = colors.textSecondary;
    if (slot * (n - r) > 50) ctx.fillText(`Elegir (${n - r})`, padX + slot * r + 8, 20);

    for (let i = 0; i < n; i++) {
      const x = xOf(i) - bw / 2;
      if (i >= rd.arrived && !rd.done) {
        // Not yet arrived: a ghost card.
        roundRectPath(ctx, x, bottom - Math.min(26, hMax * 0.2), bw, Math.min(26, hMax * 0.2), Math.min(4, bw / 3));
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 1;
        ctx.stroke();
        if (bw > 12) {
          ctx.fillStyle = colors.textTertiary;
          ctx.textAlign = 'center';
          ctx.fillText('?', xOf(i), bottom - Math.min(13, hMax * 0.1));
        }
        continue;
      }
      const isNew = i === rd.arrived - 1 && !rd.done;
      const grow = isNew ? Math.min(1, rd.timer / (ARRIVAL * 0.45)) : 1;
      const eased = 1 - Math.pow(1 - grow, 3);
      const y = yOf(rd.scores[i]);
      const h = (bottom - y) * eased;
      const afterChoice = rd.done && rd.chosen !== null && i > rd.chosen;
      let fill = colors.textTertiary;
      if (i < r) fill = colors.series[1];
      if (i === rd.chosen) fill = i === best ? colors.success : colors.warning;
      roundRectPath(ctx, x, bottom - h, bw, h, Math.min(4, bw / 3));
      ctx.fillStyle = fill;
      ctx.globalAlpha = afterChoice ? 0.3 : i === rd.chosen || i < r ? 0.95 : 0.6;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (rd.done && i === best) {
        // Star over the best candidate once everything is revealed.
        drawStar(ctx, xOf(i), y - 12, 7, colors.warning);
      }
    }

    // Threshold = best seen while observing.
    if (Number.isFinite(rd.threshold) && rd.arrived > 0) {
      const y = yOf(rd.threshold);
      ctx.strokeStyle = colors.text;
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(padX + slot * r, y);
      ctx.lineTo(W - padX, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.textSecondary;
      ctx.textAlign = 'right';
      ctx.font = '11px -apple-system, system-ui, sans-serif';
      ctx.fillText('listón: mejor de los observados', W - padX, y - 9);
    }

    if (rd.chosen !== null) {
      const x = xOf(rd.chosen);
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, bottom + 12, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = colors.accent;
      ctx.textAlign = x > W - 80 ? 'right' : 'left';
      ctx.font = '600 11px -apple-system, system-ui, sans-serif';
      ctx.fillText('contratado', x + (x > W - 80 ? -10 : 10), bottom + 12);
    }
    ctx.strokeStyle = colors.borderStrong;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX - 4, bottom + 0.5);
    ctx.lineTo(W - padX + 4, bottom + 0.5);
    ctx.stroke();
  });

  const rd = round.current;
  const best = argMax(rd.scores);
  const t = tally.current;
  const status = !rd.done ? (
    <span className="sim-badge">
      Candidato {Math.min(rd.arrived + 1, n)} de {n} · {rd.arrived < r ? 'observando' : 'buscando a alguien mejor'}
    </span>
  ) : rd.chosen === best ? (
    <span className="sim-badge sim-badge--success">¡Has contratado al mejor!</span>
  ) : (
    <span className="sim-badge sim-badge--danger">
      {best < r ? `El mejor (nº ${best + 1}) llegó mientras observabas` : `Te precipitaste: el mejor era el nº ${best + 1}`}
    </span>
  );

  return (
    <SimPage
      title="Problema de la parada óptima"
      lead="Entrevistas candidatos de uno en uno y tienes que decidir en el momento: si rechazas a alguien, no vuelve. ¿Cuántos conviene ver antes de empezar a elegir?"
    >
      <SimMain
        stage={
          <Panel title="Entrevistas" actions={status}>
            <Stage canvasRef={canvasRef} aspect="16 / 9" label="Candidatos llegando con su puntuación" />
            <p className="sim-note">
              Altura = valía real del candidato. La franja azul es la fase de observación: nadie se contrata ahí, solo se
              fija el listón.
            </p>
          </Panel>
        }
        side={
          <>
            <Panel title="Controles">
              <ControlRow>
                <PlayPauseButton playing={playing} onToggle={toggle} />
                <StepButton onClick={() => { if (round.current.done) restart(); else arrive(); setFrame((f) => f + 1); }} label="Siguiente" />
                <ResetButton onClick={restart} label="Nueva ronda" />
              </ControlRow>
              <Slider label="Candidatos (n)" value={n} min={3} max={100} onChange={setN} />
              <Slider
                label="Observar primero (r)"
                value={r}
                min={0}
                max={n - 1}
                onChange={setR}
                format={(v) => `${v} (${Math.round((v / n) * 100)} %)`}
              />
              <ControlRow>
                <Button variant="ghost" onClick={() => setR(rStar)}>
                  Usar el óptimo (r = {rStar})
                </Button>
              </ControlRow>
              <SpeedControl value={speed} onChange={setSpeed} speeds={[0.5, 1, 2, 4, 8]} />
              <Toggle label="Repetir rondas automáticamente" checked={auto} onChange={setAuto} />
            </Panel>
            <Panel title="Rondas animadas">
              <StatGrid>
                <Stat label="Rondas" value={formatInt(t.rounds)} />
                <Stat
                  label="Aciertos"
                  value={t.rounds ? formatPercent(t.wins / t.rounds, 0) : '—'}
                  sub={`teoría ${formatPercent(theoreticalSecretarySuccess(n, r), 1)}`}
                />
              </StatGrid>
            </Panel>
          </>
        }
      />

      <Panel
        title="Montecarlo: probabilidad de éxito según cuántos observas"
        actions={
          <>
            {[100, 1000, 10000, 100000].map((k) => (
              <Button key={k} onClick={() => runner.enqueue(k)}>
                +{formatInt(k)}
              </Button>
            ))}
            <ResetButton
              label="Borrar"
              onClick={() => {
                runner.cancel();
                mc.current = { trials: 0, wins: new Array<number>(n).fill(0) };
                setFrame((f) => f + 1);
              }}
            />
          </>
        }
      >
        <StatGrid>
          <Stat label="Rondas simuladas" value={formatInt(s.trials)} sub={runner.running ? 'simulando…' : 'cada ronda prueba todos los r'} />
          <Stat label="Óptimo teórico" value={`r = ${rStar}`} sub={`${formatPercent(rStar / n, 1)} de n · P = ${formatPercent(theoreticalSecretarySuccess(n, rStar), 1)}`} />
          <Stat label="Mejor r simulado" value={bestEmpirical === null ? '—' : `r = ${bestEmpirical}`} sub={bestEmpirical === null ? undefined : `P ≈ ${formatPercent(s.wins[bestEmpirical] / s.trials, 1)}`} />
        </StatGrid>
        <LineChart
          ariaLabel="Probabilidad de contratar al mejor según la fracción observada"
          height={260}
          xDomain={[0, 1]}
          yDomain={[0, 0.5]}
          formatX={(v) => `${Math.round(v * 100)} %`}
          formatY={(v) => `${Math.round(v * 100)} %`}
          xLabel="fracción observada r/n"
          series={[
            { id: 'theory', label: 'Teoría P(r)', color: colors.series[0], points: theory },
            { id: 'mc', label: 'Simulación', color: colors.series[1], points: empirical, dots: true, noLine: true },
          ]}
          refLines={[
            { axis: 'x', value: 1 / Math.E, label: '1/e ≈ 36,8 %', color: colors.textSecondary },
            { axis: 'x', value: r / n, label: 'tu r', color: colors.accent },
            { axis: 'y', value: 1 / Math.E, color: colors.textTertiary },
          ]}
        />
      </Panel>

      <Explanation>
        <p>
          La estrategia: <strong>observa a los primeros r candidatos sin contratar a nadie</strong> y quédate con el mejor
          de ellos como listón. Después, contrata al primero que supere el listón. Si r es pequeño, el listón es bajo y te
          precipitas; si es grande, lo más probable es que el mejor ya haya pasado mientras observabas.
        </p>
        <p>
          Acertar exige que el mejor llegue en la posición i &gt; r y que el mejor de los i − 1 anteriores esté dentro de
          la fase de observación (probabilidad r/(i − 1)). Sumando:
          {' '}<span className="formula">P(r) = (r/n) · (1/r + 1/(r+1) + … + 1/(n−1))</span>.
        </p>
        <p>
          Para n grande, con x = r/n esto se aproxima por <span className="formula">−x·ln x</span>, cuyo máximo está en{' '}
          <strong>x = 1/e ≈ 36,8 %</strong> y vale también <strong>1/e</strong>. Da igual que haya 10 o 10 000 candidatos:
          observando al 37 % aciertas al mejor más de un tercio de las veces. Con n = {n} el óptimo exacto es r = {rStar}{' '}
          ({formatDecimal(theoreticalSecretarySuccess(n, rStar) * 100, 1)} %).
        </p>
      </Explanation>
    </SimPage>
  );
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    if (i === 0) ctx.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
    else ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
