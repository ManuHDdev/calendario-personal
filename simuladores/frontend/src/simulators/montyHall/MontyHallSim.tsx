import { useEffect, useRef, useState } from 'react';
import LineChart, { type Point } from '../../components/charts/LineChart';
import { Button, ControlRow, PlayPauseButton, ResetButton, Segmented, Slider, Stat, StatGrid } from '../../components/controls/Controls';
import { Explanation, Panel, SimMain, SimPage } from '../../components/layout/SimLayout';
import { useAnimationFrame } from '../../hooks/useAnimationFrame';
import { useThemeColors } from '../../hooks/useThemeColors';
import { formatInt, formatPercent } from '../../lib/format';
import {
  hostReveal,
  randomGame,
  stayWins,
  theoreticalStay,
  theoreticalSwitch,
  type MontyHallGame,
} from '../../lib/montyHall';
import { mulberry32, randInt, randomSeed, type Rng } from '../../lib/random';
import '../sims.css';

type Phase = 'pick' | 'reveal' | 'decide' | 'result';

interface Manual {
  phase: Phase;
  prize: number;
  game: MontyHallGame | null;
  openedSoFar: number;
  finalPick: number | null;
}

interface Tally {
  games: number;
  stayWins: number;
  history: { x: number; stay: number; sw: number }[];
}

const emptyTally = (): Tally => ({ games: 0, stayWins: 0, history: [] });
const RATES = [1, 10, 100, 1000];

export default function MontyHallSim() {
  const colors = useThemeColors();
  // Auto-play starts paused: the manual game is the first thing to try.
  const [playing, setPlaying] = useState(false);
  const toggle = () => setPlaying((p) => !p);
  const [doors, setDoors] = useState(3);
  const [rate, setRate] = useState(10);
  const rng = useRef<Rng>(mulberry32(randomSeed()));
  const [manual, setManual] = useState<Manual>(() => ({ phase: 'pick', prize: randInt(rng.current, 3), game: null, openedSoFar: 0, finalPick: null }));
  const [manualStats, setManualStats] = useState({ stayPlays: 0, stayWins: 0, switchPlays: 0, switchWins: 0 });
  const auto = useRef<Tally>(emptyTally());
  const [lastAuto, setLastAuto] = useState<MontyHallGame | null>(null);
  const acc = useRef(0);
  const [, setFrame] = useState(0);

  const newManual = (d = doors) =>
    setManual({ phase: 'pick', prize: randInt(rng.current, d), game: null, openedSoFar: 0, finalPick: null });

  useEffect(() => {
    newManual(doors);
    auto.current = emptyTally();
    setLastAuto(null);
    setManualStats({ stayPlays: 0, stayWins: 0, switchPlays: 0, switchWins: 0 });
  }, [doors]);

  // Host opens goat doors one after another.
  useEffect(() => {
    if (manual.phase !== 'reveal' || !manual.game) return;
    const total = manual.game.opened.length;
    const delay = total > 4 ? 180 : 480;
    const id = window.setTimeout(() => {
      setManual((m) => {
        if (!m.game) return m;
        const next = m.openedSoFar + 1;
        return { ...m, openedSoFar: next, phase: next >= m.game.opened.length ? 'decide' : 'reveal' };
      });
    }, manual.openedSoFar === 0 ? 450 : delay);
    return () => window.clearTimeout(id);
  }, [manual]);

  const pickDoor = (d: number) => {
    if (manual.phase === 'pick') {
      setManual((m) => ({ ...m, phase: 'reveal', game: hostReveal(doors, m.prize, d, rng.current), openedSoFar: 0 }));
    } else if (manual.phase === 'decide' && manual.game && (d === manual.game.firstPick || d === manual.game.remaining)) {
      finish(d);
    }
  };

  const finish = (finalPick: number) => {
    const g = manual.game;
    if (!g) return;
    const switched = finalPick !== g.firstPick;
    const win = finalPick === g.prize;
    setManualStats((s) =>
      switched
        ? { ...s, switchPlays: s.switchPlays + 1, switchWins: s.switchWins + (win ? 1 : 0) }
        : { ...s, stayPlays: s.stayPlays + 1, stayWins: s.stayWins + (win ? 1 : 0) },
    );
    setManual((m) => ({ ...m, phase: 'result', finalPick }));
  };

  useAnimationFrame((dt) => {
    acc.current += dt * rate;
    const k = Math.floor(acc.current);
    if (k === 0) return;
    acc.current -= k;
    const t = auto.current;
    let last: MontyHallGame | null = null;
    for (let i = 0; i < k; i++) {
      last = randomGame(doors, rng.current);
      t.games++;
      if (stayWins(last)) t.stayWins++;
      const every = t.games < 200 ? 1 : Math.ceil(t.games / 300);
      if (t.games % every === 0) t.history.push({ x: t.games, stay: t.stayWins / t.games, sw: 1 - t.stayWins / t.games });
    }
    if (rate <= 10) setLastAuto(last);
    setFrame((f) => f + 1);
  }, playing);

  // What the doors show: the manual game, or the latest auto game while it runs slowly.
  const showingAuto = playing && rate <= 10 && lastAuto !== null;
  const view = showingAuto
    ? { game: lastAuto, prize: lastAuto!.prize, opened: new Set(lastAuto!.opened), all: true, picked: lastAuto!.firstPick, final: null as number | null }
    : {
        game: manual.game,
        prize: manual.prize,
        opened: new Set(manual.game ? manual.game.opened.slice(0, manual.openedSoFar) : []),
        all: manual.phase === 'result',
        picked: manual.game?.firstPick ?? null,
        final: manual.finalPick,
      };

  const t = auto.current;
  const stayRate = t.games ? t.stayWins / t.games : 0;
  const switchRate = t.games ? 1 - stayRate : 0;
  const pStay = theoreticalStay(doors);
  const pSwitch = theoreticalSwitch(doors);
  const stayPts: Point[] = t.history.map((h) => ({ x: h.x, y: h.stay }));
  const swPts: Point[] = t.history.map((h) => ({ x: h.x, y: h.sw }));

  let message: React.ReactNode;
  if (showingAuto) message = <span>Simulando partidas: el presentador abre {doors - 2} {doors - 2 === 1 ? 'puerta' : 'puertas'} con cabra en cada una.</span>;
  else if (manual.phase === 'pick') message = <span>Elige una puerta. Detrás de una hay un coche; detrás del resto, cabras.</span>;
  else if (manual.phase === 'reveal') message = <span>El presentador, que sabe dónde está el coche, abre puertas con cabra…</span>;
  else if (manual.phase === 'decide' && manual.game)
    message = (
      <>
        <span>¿Te quedas con la {manual.game.firstPick + 1} o cambias a la {manual.game.remaining + 1}?</span>
        <Button onClick={() => finish(manual.game!.firstPick)}>Quedarme</Button>
        <Button variant="primary" onClick={() => finish(manual.game!.remaining)}>
          Cambiar
        </Button>
      </>
    );
  else if (manual.game && manual.finalPick !== null) {
    const win = manual.finalPick === manual.prize;
    const switched = manual.finalPick !== manual.game.firstPick;
    message = (
      <>
        <span className={`sim-badge ${win ? 'sim-badge--success' : 'sim-badge--danger'}`}>
          {win ? '¡Coche!' : 'Cabra'} · {switched ? 'cambiaste' : 'te quedaste'}
        </span>
        <Button variant="primary" onClick={() => newManual()}>
          Jugar otra vez
        </Button>
      </>
    );
  }

  return (
    <SimPage
      title="Monty Hall"
      lead="Un concurso clásico que engaña a casi todo el mundo, matemáticos incluidos. Juega a mano o deja que el simulador juegue miles de veces."
    >
      <SimMain
        stage={
          <Panel title="El concurso">
            <div
              className="mh-stage"
              style={{ gridTemplateColumns: `repeat(${doors}, minmax(0, ${doors > 5 ? 90 : 140}px))` }}
            >
              {Array.from({ length: doors }, (_, d) => {
                const open = view.all || view.opened.has(d);
                const picked = view.picked === d;
                const clickable = !showingAuto && (manual.phase === 'pick' || (manual.phase === 'decide' && (d === manual.game?.firstPick || d === manual.game?.remaining)));
                return (
                  <div className="mh-door-wrap" key={d}>
                    <button
                      type="button"
                      className={`mh-door${open ? ' mh-door--open' : ''}${picked ? ' mh-door--picked' : ''}${showingAuto ? ' mh-door--instant' : ''}`}
                      onClick={() => pickDoor(d)}
                      disabled={!clickable}
                      aria-label={`Puerta ${d + 1}${open ? (d === view.prize ? ': coche' : ': cabra') : ''}`}
                    >
                      <span className="mh-behind">{d === view.prize ? <CarIcon color={colors.series[0]} /> : <GoatIcon color={colors.textSecondary} />}</span>
                      <span className="mh-leaf">{d + 1}</span>
                    </button>
                    <span className={`mh-door-tag${picked ? ' mh-door-tag--pick' : ''}`}>
                      {view.final === d ? 'final' : picked ? 'elegida' : !showingAuto && manual.phase === 'decide' && d === manual.game?.remaining ? '¿cambiar?' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mh-message">{message}</div>
          </Panel>
        }
        side={
          <>
            <Panel title="Controles">
              <Slider label="Puertas" value={doors} min={3} max={10} onChange={setDoors} hint={`El presentador abre ${doors - 2} ${doors - 2 === 1 ? 'puerta' : 'puertas'} con cabra`} />
              <ControlRow>
                <PlayPauseButton playing={playing} onToggle={toggle} />
                <ResetButton
                  label="Borrar"
                  onClick={() => {
                    auto.current = emptyTally();
                    setLastAuto(null);
                    setFrame((f) => f + 1);
                  }}
                />
              </ControlRow>
              <Segmented label="Partidas por segundo" value={rate} onChange={setRate} options={RATES.map((r) => ({ value: r, label: formatInt(r) }))} />
            </Panel>
            <Panel title="Tus partidas">
              <StatGrid>
                <Stat label="Quedándote" value={manualStats.stayPlays ? formatPercent(manualStats.stayWins / manualStats.stayPlays, 0) : '—'} sub={`${manualStats.stayWins}/${manualStats.stayPlays} coches`} />
                <Stat label="Cambiando" value={manualStats.switchPlays ? formatPercent(manualStats.switchWins / manualStats.switchPlays, 0) : '—'} sub={`${manualStats.switchWins}/${manualStats.switchPlays} coches`} />
              </StatGrid>
            </Panel>
          </>
        }
      />

      <Panel title={`Simulación automática · ${formatInt(t.games)} partidas`}>
        <div className="mh-bars">
          {[
            { label: 'Cambiar', value: switchRate, theory: pSwitch, color: colors.series[0] },
            { label: 'Quedarse', value: stayRate, theory: pStay, color: colors.series[4] },
          ].map((b) => (
            <div className="mh-bar-row" key={b.label}>
              <span>{b.label}</span>
              <div className="mh-bar" title={`teoría ${formatPercent(b.theory, 1)}`}>
                <div className="mh-bar-fill" style={{ width: `${b.value * 100}%`, background: b.color }} />
                <div className="mh-bar-theory" style={{ left: `calc(${b.theory * 100}% - 1px)` }} />
              </div>
              <span className="num">{t.games ? formatPercent(b.value, 1) : '—'}</span>
            </div>
          ))}
          <p className="sim-note">La marca vertical es la probabilidad teórica: {formatPercent(pSwitch, 1)} cambiando, {formatPercent(pStay, 1)} quedándose.</p>
        </div>
        <LineChart
          ariaLabel="Porcentaje de victorias según la estrategia"
          height={230}
          xLog
          xDomain={[1, Math.max(10, t.games)]}
          yDomain={[0, 1]}
          formatY={(v) => `${Math.round(v * 100)} %`}
          xLabel="partidas"
          series={[
            { id: 'switch', label: 'Cambiar', color: colors.series[0], points: swPts },
            { id: 'stay', label: 'Quedarse', color: colors.series[4], points: stayPts },
          ]}
          refLines={[
            { axis: 'y', value: pSwitch, label: `(n−1)/n = ${formatPercent(pSwitch, 1)}`, color: colors.series[0] },
            { axis: 'y', value: pStay, label: `1/n = ${formatPercent(pStay, 1)}`, color: colors.series[4] },
          ]}
        />
      </Panel>

      <Explanation>
        <p>
          Tu primera elección acierta con probabilidad <strong>1/{doors}</strong>. El presentador no abre puertas al azar:
          sabe dónde está el coche y <strong>siempre</strong> enseña cabras. Abrirlas no cambia lo que había detrás de tu
          puerta, así que quedarse sigue ganando 1/{doors} de las veces.
        </p>
        <p>
          Toda la probabilidad restante, <span className="formula">{doors - 1}/{doors}</span>, estaba repartida entre las
          otras puertas, y el presentador la ha concentrado en la única que deja cerrada. Cambiar equivale a quedarte con
          todas las demás puertas a la vez: solo pierdes si acertaste a la primera.
        </p>
        <p>Con más puertas se ve aún más claro: con 10 puertas, cambiar gana el 90 % de las veces.</p>
      </Explanation>
    </SimPage>
  );
}

function CarIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 64 40" aria-hidden>
      <path d="M6 28v-6l6-2 8-9h20l10 9 8 2v6z" fill={color} />
      <path d="M22 13h8v7h-14zM33 13h6l7 7H33z" fill="#fff" opacity="0.75" />
      <circle cx="18" cy="29" r="5.5" fill="#333" />
      <circle cx="46" cy="29" r="5.5" fill="#333" />
      <circle cx="18" cy="29" r="2.2" fill="#ccc" />
      <circle cx="46" cy="29" r="2.2" fill="#ccc" />
    </svg>
  );
}

function GoatIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 64 56" aria-hidden>
      <path d="M22 14c-6-10-14-10-16-6 5-1 9 2 12 8zM42 14c6-10 14-10 16-6-5-1-9 2-12 8z" fill={color} opacity="0.8" />
      <path d="M14 20c-5 0-9 2-11 5 4 2 8 2 12 0zM50 20c5 0 9 2 11 5-4 2-8 2-12 0z" fill={color} opacity="0.7" />
      <path d="M18 18c0-4 6-7 14-7s14 3 14 7c0 10-5 22-14 26-9-4-14-16-14-26z" fill={color} />
      <path d="M28 44c0 5 2 9 4 10 2-1 4-5 4-10z" fill={color} opacity="0.8" />
      <circle cx="25" cy="25" r="2.4" fill="#fff" />
      <circle cx="39" cy="25" r="2.4" fill="#fff" />
    </svg>
  );
}
