import { useEffect, useMemo, useRef, useState } from 'react';
import BarChart from '../../components/charts/BarChart';
import LineChart, { type Point } from '../../components/charts/LineChart';
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
  StepButton,
  Toggle,
} from '../../components/controls/Controls';
import { ChartGrid, Explanation, Panel, SimMain, SimPage, Stage } from '../../components/layout/SimLayout';
import { useAnimationFrame } from '../../hooks/useAnimationFrame';
import { useBatchRunner } from '../../hooks/useBatchRunner';
import { useCanvas } from '../../hooks/useCanvas';
import { useThemeColors } from '../../hooks/useThemeColors';
import { formatInt, formatPercent } from '../../lib/format';
import { cycleDecomposition } from '../../lib/permutations';
import {
  longestCycleDistribution,
  loopSearch,
  maxOpens,
  randomSearch,
  runPrisonersTrial,
  theoreticalLoopSuccess,
  theoreticalRandomSuccess,
  type SearchResult,
} from '../../lib/prisoners';
import { mulberry32, randomPermutation, randomSeed, type Rng } from '../../lib/random';
import { arrow, categoricalColor, roundRectPath, usePlayback } from '../shared';
import { layoutRings } from './rings';
import '../sims.css';

type Strategy = 'loop' | 'random';
type GroupStatus = 'running' | 'won' | 'lost';

interface Walk {
  prisoner: number;
  search: SearchResult;
  revealed: number;
  timer: number;
  hold: boolean;
}

/** Seconds per opened box at 1×. */
const OPEN_INTERVAL = 0.42;

export default function PrisonersSim() {
  const colors = useThemeColors();
  const { playing, setPlaying, toggle, speed, setSpeed } = usePlayback(2);
  const [n, setN] = useState(100);
  const [seed, setSeed] = useState(randomSeed);
  const [strategy, setStrategy] = useState<Strategy>('loop');
  const [showCycles, setShowCycles] = useState(true);
  const [, setFrame] = useState(0);
  const [group, setGroup] = useState<GroupStatus>('running');

  const perm = useMemo(() => randomPermutation(n, mulberry32(seed)), [n, seed]);
  const cycles = useMemo(() => cycleDecomposition(perm), [perm]);
  const cycleOfBox = useMemo(() => {
    const map = new Array<number>(n);
    cycles.forEach((c, ci) => c.forEach((b) => (map[b] = ci)));
    return map;
  }, [cycles, n]);
  const longest = useMemo(() => Math.max(...cycles.map((c) => c.length)), [cycles]);
  const limit = maxOpens(n);

  const walkRng = useRef<Rng>(mulberry32(seed ^ 0x9e3779b9));
  const makeWalk = (prisoner: number): Walk => ({
    prisoner,
    search: strategy === 'loop' ? loopSearch(perm, prisoner, limit) : randomSearch(perm, prisoner, walkRng.current, limit),
    revealed: 0,
    timer: 0,
    hold: false,
  });
  const walk = useRef<Walk>(null as unknown as Walk);
  if (walk.current === null) walk.current = makeWalk(0);

  const resetWalk = () => {
    walkRng.current = mulberry32(seed ^ 0x9e3779b9);
    walk.current = makeWalk(0);
    setGroup('running');
    setFrame((f) => f + 1);
  };

  // A new permutation, size or strategy restarts the walk from prisoner 1.
  useEffect(resetWalk, [perm, strategy]);

  /** Advance the walk by one event (open a box, or move on to the next prisoner). */
  const stepWalk = (): boolean => {
    const w = walk.current;
    if (group !== 'running') return false;
    if (w.revealed < w.search.opened.length) {
      w.revealed++;
      if (w.revealed === w.search.opened.length) w.hold = true;
      return true;
    }
    if (!w.search.found) {
      setGroup('lost');
      setPlaying(false);
      return false;
    }
    if (w.prisoner === n - 1) {
      setGroup('won');
      setPlaying(false);
      return false;
    }
    walk.current = makeWalk(w.prisoner + 1);
    return true;
  };

  const skipPrisoner = () => {
    const w = walk.current;
    if (w.revealed < w.search.opened.length) {
      w.revealed = w.search.opened.length;
      w.hold = true;
    } else stepWalk();
    setFrame((f) => f + 1);
  };

  useAnimationFrame(
    (dt) => {
      const w = walk.current;
      w.timer += dt * speed;
      const interval = w.hold ? OPEN_INTERVAL * 2.2 : OPEN_INTERVAL;
      if (w.timer >= interval) {
        w.timer = 0;
        w.hold = false;
        stepWalk();
        setFrame((f) => f + 1);
      } else draw();
    },
    playing && group === 'running',
  );

  // ── Monte Carlo ──────────────────────────────────────────────────────────
  const mc = useRef({ total: 0, loopWins: 0, randomWins: 0, longest: new Array<number>(n + 1).fill(0), history: [] as { x: number; loop: number; random: number }[] });
  const mcRng = useRef<Rng>(mulberry32(randomSeed()));
  const resetMc = () => {
    mc.current = { total: 0, loopWins: 0, randomWins: 0, longest: new Array<number>(n + 1).fill(0), history: [] };
  };
  const runner = useBatchRunner((k) => {
    const s = mc.current;
    for (let i = 0; i < k; i++) {
      const t = runPrisonersTrial(n, mcRng.current);
      s.total++;
      if (t.loopWin) s.loopWins++;
      if (t.randomWin) s.randomWins++;
      s.longest[t.longestCycle]++;
      const every = s.total < 200 ? 1 : Math.ceil(s.total / 300);
      if (s.total % every === 0) s.history.push({ x: s.total, loop: s.loopWins / s.total, random: s.randomWins / s.total });
    }
  });
  useEffect(() => {
    runner.cancel();
    resetMc();
  }, [n]);

  const theoryLoop = theoreticalLoopSuccess(n);
  const theoryRandom = theoreticalRandomSuccess(n);
  const dist = useMemo(() => longestCycleDistribution(n), [n]);

  // ── Drawing ──────────────────────────────────────────────────────────────
  const boxes = useCanvas();
  const rings = useCanvas();
  const ringLayout = useMemo(
    () => layoutRings(cycles.map((c) => c.length), rings.size.width, rings.size.height),
    [cycles, rings.size.width, rings.size.height],
  );

  function boxGeometry(width: number, height: number) {
    const cols = Math.max(1, Math.ceil(Math.sqrt((n * width) / height)));
    const rowsCount = Math.ceil(n / cols);
    const cell = Math.min(width / cols, height / rowsCount);
    const ox = (width - cell * cols) / 2;
    const oy = (height - cell * rowsCount) / 2;
    const center = (b: number) => ({ x: ox + (b % cols) * cell + cell / 2, y: oy + Math.floor(b / cols) * cell + cell / 2 });
    return { cell, center };
  }

  function draw() {
    drawBoxes();
    drawRings();
  }

  function drawBoxes() {
    const ctx = boxes.getContext();
    const { width, height } = boxes.size;
    if (!ctx || width < 2) return;
    ctx.fillStyle = colors.canvasBg;
    ctx.fillRect(0, 0, width, height);
    const pad = 10;
    const { cell, center } = boxGeometry(width - 2 * pad, height - 2 * pad);
    const size = cell * 0.84;
    const w = walk.current;
    const opened = w.search.opened.slice(0, w.revealed);
    const openedSet = new Set(opened);
    const current = opened[opened.length - 1];
    const target = w.prisoner;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let b = 0; b < n; b++) {
      const c = center(b);
      const x = pad + c.x - size / 2;
      const y = pad + c.y - size / 2;
      const isOpen = openedSet.has(b);
      const isHit = isOpen && perm[b] === target;
      const cycleColor = categoricalColor(cycleOfBox[b], colors.dark, 1);
      roundRectPath(ctx, x, y, size, size, size * 0.18);
      if (isHit) ctx.fillStyle = colors.success;
      else if (isOpen) ctx.fillStyle = colors.bgPrimary;
      else if (showCycles) ctx.fillStyle = categoricalColor(cycleOfBox[b], colors.dark, colors.dark ? 0.28 : 0.2);
      else ctx.fillStyle = colors.bgTertiary;
      ctx.fill();
      ctx.lineWidth = b === current ? 2.5 : isOpen ? 1.6 : 1;
      ctx.strokeStyle = b === current ? colors.accent : isOpen ? (showCycles ? cycleColor : colors.textSecondary) : showCycles ? categoricalColor(cycleOfBox[b], colors.dark, 0.55) : colors.border;
      ctx.stroke();
      if (isOpen) {
        ctx.font = `700 ${Math.max(8, size * 0.42)}px -apple-system, system-ui, sans-serif`;
        ctx.fillStyle = isHit ? '#fff' : colors.text;
        ctx.fillText(String(perm[b] + 1), pad + c.x, pad + c.y + 0.5);
      } else if (size > 15) {
        ctx.font = `500 ${Math.max(7, size * 0.3)}px -apple-system, system-ui, sans-serif`;
        ctx.fillStyle = colors.textTertiary;
        ctx.fillText(String(b + 1), pad + c.x, pad + c.y + 0.5);
      }
    }

    // Path between opened boxes: for the loop strategy this is the prisoner's own cycle.
    if (opened.length > 1) {
      ctx.strokeStyle = colors.accent;
      ctx.fillStyle = colors.accent;
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.85;
      if (strategy === 'random') ctx.setLineDash([4, 4]);
      for (let i = 0; i + 1 < opened.length; i++) {
        const a = center(opened[i]);
        const b = center(opened[i + 1]);
        const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const shrink = Math.min(size * 0.45, d / 3);
        const ux = (b.x - a.x) / d;
        const uy = (b.y - a.y) / d;
        arrow(ctx, pad + a.x + ux * shrink, pad + a.y + uy * shrink, pad + b.x - ux * shrink, pad + b.y - uy * shrink, Math.max(4, size * 0.22));
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Halo on the box about to be opened next (the number just read).
    if (group === 'running' && w.revealed < w.search.opened.length && w.revealed > 0 && strategy === 'loop') {
      const nb = w.search.opened[w.revealed];
      const c = center(nb);
      ctx.strokeStyle = colors.accent;
      ctx.globalAlpha = 0.35 + 0.4 * pulse;
      ctx.lineWidth = 2;
      roundRectPath(ctx, pad + c.x - size / 2 - 3, pad + c.y - size / 2 - 3, size + 6, size + 6, size * 0.22);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawRings() {
    const ctx = rings.getContext();
    const { width, height } = rings.size;
    if (!ctx || width < 2) return;
    ctx.fillStyle = colors.canvasBg;
    ctx.fillRect(0, 0, width, height);
    const w = walk.current;
    const activeCycle = cycleOfBox[w.prisoner];
    const openedSet = new Set(w.search.opened.slice(0, w.revealed));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ringLayout.rings.forEach((r, ci) => {
      if (!r) return;
      const cycle = cycles[ci];
      const len = cycle.length;
      const col = categoricalColor(ci, colors.dark, 1);
      const tooLong = len > limit;
      const isActive = ci === activeCycle;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.strokeStyle = tooLong ? colors.danger : col;
      ctx.globalAlpha = isActive ? 0.9 : 0.4;
      ctx.lineWidth = isActive ? 2.2 : 1.2;
      if (tooLong) ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      const dot = Math.max(1.6, Math.min(ringLayout.dot, r.r * 0.6));
      for (let i = 0; i < len; i++) {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / len;
        const x = r.x + r.r * Math.cos(a);
        const y = r.y + r.r * Math.sin(a);
        const b = cycle[i];
        ctx.beginPath();
        ctx.arc(x, y, openedSet.has(b) ? dot * 1.5 : dot, 0, Math.PI * 2);
        ctx.fillStyle = openedSet.has(b) ? colors.accent : col;
        ctx.globalAlpha = isActive || !showCycles ? 1 : 0.75;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (r.r > 14) {
        ctx.font = `600 ${Math.min(16, r.r * 0.5)}px -apple-system, system-ui, sans-serif`;
        ctx.fillStyle = tooLong ? colors.danger : colors.textSecondary;
        ctx.fillText(String(len), r.x, r.y);
      }
    });
    if (ringLayout.shown < cycles.length) {
      ctx.font = '12px -apple-system, system-ui, sans-serif';
      ctx.fillStyle = colors.textTertiary;
      ctx.textAlign = 'right';
      ctx.fillText(`+${cycles.length - ringLayout.shown} ciclos pequeños`, width - 8, height - 10);
    }
  }

  useEffect(() => {
    draw();
  });

  const w = walk.current;
  const s = mc.current;
  const historyLoop: Point[] = s.history.map((h) => ({ x: h.x, y: h.loop }));
  const historyRandom: Point[] = s.history.map((h) => ({ x: h.x, y: h.random }));
  const longestBars = useMemo(() => s.longest.slice(1).map((c, i) => ({ x: i + 1, value: s.total ? c / s.total : 0 })), [s.total, s.longest]);
  const distPoints: Point[] = dist.slice(1).map((p, i) => ({ x: i + 1, y: p }));

  const statusBadge =
    group === 'won' ? (
      <span className="sim-badge sim-badge--success">¡Todos encontraron su número! El grupo se salva</span>
    ) : group === 'lost' ? (
      <span className="sim-badge sim-badge--danger">
        El prisionero {w.prisoner + 1} no encontró su número en {limit} cajas: todos pierden
      </span>
    ) : w.search.found && w.revealed === w.search.opened.length ? (
      <span className="sim-badge sim-badge--success">Encontrado en {w.search.opened.length} cajas</span>
    ) : (
      <span className="sim-badge">
        Prisionero {w.prisoner + 1} de {n} · busca el {w.prisoner + 1} · {w.revealed}/{limit} cajas
      </span>
    );

  return (
    <SimPage
      title="Dilema de los 100 prisioneros"
      lead={`${n} prisioneros numerados y ${n} cajas cerradas con sus números barajados. Cada uno puede abrir ${limit} cajas y no pueden comunicarse: si alguno no encuentra su número, todos pierden.`}
    >
      <SimMain
        stage={
          <>
            <Panel title="Las cajas" actions={statusBadge}>
              <Stage canvasRef={boxes.canvasRef} aspect="4 / 3" label="Cuadrícula de cajas con el recorrido del prisionero actual" />
            </Panel>
            <Panel
              title="La permutación como ciclos"
              actions={
                <span className={`sim-badge ${longest > limit ? 'sim-badge--danger' : 'sim-badge--success'}`}>
                  Ciclo más largo: {longest} {longest > limit ? `> ${limit}` : `≤ ${limit}`}
                </span>
              }
            >
              <Stage canvasRef={rings.canvasRef} aspect="2 / 1" label="Ciclos de la permutación dibujados como anillos" />
              <p className="sim-note">
                Cada anillo es un ciclo: caja → número dentro → caja con ese número… El número del anillo es su longitud;
                los discontinuos en rojo son más largos que {limit}.
              </p>
            </Panel>
          </>
        }
        side={
          <>
            <Panel title="Controles">
              <ControlRow>
                <PlayPauseButton playing={playing && group === 'running'} onToggle={group === 'running' ? toggle : resetWalk} />
                <StepButton onClick={() => { stepWalk(); setFrame((f) => f + 1); }} label="Abrir caja" disabled={group !== 'running'} />
                <Button onClick={skipPrisoner} disabled={group !== 'running'}>
                  Siguiente
                </Button>
              </ControlRow>
              <ControlRow>
                <ResetButton onClick={resetWalk} label="Repetir" />
                <Button variant="ghost" onClick={() => setSeed(randomSeed())}>
                  Nueva permutación
                </Button>
              </ControlRow>
              <Segmented
                label="Estrategia"
                value={strategy}
                onChange={setStrategy}
                options={[
                  { value: 'loop', label: 'Seguir el bucle' },
                  { value: 'random', label: 'Al azar' },
                ]}
              />
              <Slider label="Prisioneros (n)" value={n} min={4} max={200} step={2} onChange={setN} hint={`Cada uno abre n/2 = ${limit} cajas`} />
              <SpeedControl value={speed} onChange={setSpeed} speeds={[0.5, 1, 2, 4, 8, 16]} />
              <Toggle label="Colorear cajas por ciclo" checked={showCycles} onChange={setShowCycles} />
            </Panel>
            <Panel title="Esta permutación">
              <StatGrid>
                <Stat label="Ciclos" value={cycles.length} sub={`≈ ln n + 0,58 = ${(Math.log(n) + 0.5772).toFixed(1).replace('.', ',')}`} />
                <Stat
                  label="Bucle"
                  value={longest <= limit ? 'Se salvan' : 'Pierden'}
                  sub={`ciclo máx. ${longest}`}
                  color={longest <= limit ? colors.success : colors.danger}
                />
              </StatGrid>
            </Panel>
          </>
        }
      />

      <Panel
        title="Montecarlo: miles de partidas"
        actions={
          <>
            {[1, 100, 1000, 10000].map((k) => (
              <Button key={k} onClick={() => runner.enqueue(k)}>
                +{formatInt(k)}
              </Button>
            ))}
            <ResetButton
              onClick={() => {
                runner.cancel();
                resetMc();
                setFrame((f) => f + 1);
              }}
              label="Borrar"
            />
          </>
        }
      >
        <StatGrid>
          <Stat label="Partidas" value={formatInt(s.total)} sub={runner.running ? 'simulando…' : undefined} />
          <Stat
            label="Éxito siguiendo el bucle"
            color={colors.series[0]}
            value={s.total ? formatPercent(s.loopWins / s.total, 1) : '—'}
            sub={`teoría ${formatPercent(theoryLoop)}`}
          />
          <Stat
            label="Éxito al azar"
            color={colors.series[4]}
            value={s.total ? formatPercent(s.randomWins / s.total, 1) : '—'}
            sub={`teoría ${formatPercent(theoryRandom)}`}
          />
        </StatGrid>
        <ChartGrid>
          <div>
            <LineChart
              ariaLabel="Tasa de éxito frente al número de partidas"
              height={220}
              xLog
              xDomain={[1, Math.max(10, s.total)]}
              yDomain={[0, 1]}
              formatY={(v) => `${Math.round(v * 100)} %`}
              xLabel="partidas"
              series={[
                { id: 'loop', label: 'Seguir el bucle', color: colors.series[0], points: historyLoop },
                { id: 'random', label: 'Al azar', color: colors.series[4], points: historyRandom },
              ]}
              refLines={[{ axis: 'y', value: theoryLoop, label: `teoría ${formatPercent(theoryLoop)}`, color: colors.series[0] }]}
            />
          </div>
          <div>
            <BarChart
              ariaLabel="Distribución del ciclo más largo"
              height={220}
              bars={longestBars}
              barLabel="Frecuencia simulada"
              barColor={colors.series[1]}
              overlays={[{ id: 'theory', label: 'Distribución teórica', color: colors.series[2], points: distPoints }]}
              refLines={[{ axis: 'x', value: limit + 0.5, label: 'n/2', color: colors.danger }]}
              shadeFrom={{ value: limit + 0.5, color: colors.danger, label: 'el grupo pierde' }}
              formatY={(v) => `${(v * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`}
              xLabel="longitud del ciclo más largo"
              xDomain={[0.5, n + 0.5]}
            />
          </div>
        </ChartGrid>
      </Panel>

      <Explanation>
        <p>
          Al azar, cada prisionero acierta con probabilidad 1/2 y, como los intentos son independientes, el grupo solo se
          salva con probabilidad <span className="formula">(1/2)<sup>{n}</sup></span>: prácticamente nunca.
        </p>
        <p>
          <strong>La estrategia del bucle</strong>: abre la caja con tu número; si dentro hay otro número, abre la caja con
          ese número, y así sucesivamente. Las cajas y sus contenidos forman una <strong>permutación</strong>, y una
          permutación se descompone en <strong>ciclos</strong>. Siguiendo el bucle, cada prisionero recorre exactamente el
          ciclo que contiene su número, y su papel está en la caja que cierra ese ciclo. Encontrará su número si y solo si
          su ciclo mide como mucho {limit}.
        </p>
        <p>
          Así, los aciertos dejan de ser independientes: <strong>todos se salvan a la vez si el ciclo más largo mide
          ≤ n/2</strong>. Como un ciclo de longitud k &gt; n/2 aparece con probabilidad exactamente 1/k, la probabilidad de
          éxito es <span className="formula">1 − (1/{limit + 1} + 1/{limit + 2} + … + 1/{n})</span> = {formatPercent(theoryLoop)}, que tiende a
          1 − ln 2 ≈ 30,7 % aunque n crezca sin límite. En el histograma se ve: toda la masa a la derecha de n/2 es
          derrota.
        </p>
      </Explanation>
    </SimPage>
  );
}
