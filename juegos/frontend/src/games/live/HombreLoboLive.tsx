import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import keycloak from '../../services/keycloak';
import { RoomSocketClient, type WsMessage } from '../../services/ws';
import '../shared.css';

interface PlayerInfo {
  id: string;
  username: string;
  isHost: boolean;
  connected: boolean;
}

type LoboRole = 'lobo' | 'aldeano' | 'vidente' | 'bruja' | 'cazador';

const ROLE_LABEL: Record<LoboRole, string> = {
  lobo: '🐺 Lobo',
  aldeano: '🧑‍🌾 Aldeano',
  vidente: '🔮 Vidente',
  bruja: '🧙 Bruja',
  cazador: '🏹 Cazador',
};

const RULE_CARDS: { role: LoboRole; text: string }[] = [
  { role: 'lobo', text: 'Cada noche, junto a los demás lobos, elegís en secreto a una víctima.' },
  { role: 'aldeano', text: 'No tienes ningún poder especial. Debate y vota de día para encontrar a los lobos.' },
  { role: 'vidente', text: 'Cada noche puedes ver en secreto el verdadero rol de un jugador.' },
  {
    role: 'bruja',
    text: 'Tienes una poción de curación (salva a la víctima de los lobos) y una de muerte (mata a quien elijas). Cada una se usa una sola vez en toda la partida, no una vez por noche.',
  },
  { role: 'cazador', text: 'Si te eliminan, de noche o de día, antes de morir eliges a otro jugador que muere contigo.' },
];

interface RoleInfo {
  role: LoboRole;
  description: string;
}

type NightPrompt =
  | { kind: 'lobo'; fellowLobos: string[] }
  | { kind: 'vidente'; options: string[] }
  | { kind: 'bruja'; lobosTarget: string | null; healAvailable: boolean; killAvailable: boolean; options: string[] }
  | { kind: 'cazador-revenge'; options: string[] };

interface DeathLogEntry {
  playerId: string;
  round: number;
  when: 'noche' | 'dia';
  role: LoboRole | null;
}

interface FinalReveal {
  winner: 'lobos' | 'aldeanos';
  roles: Record<string, LoboRole>;
}

type Phase =
  | 'lobby'
  | 'noche-lobos'
  | 'noche-vidente'
  | 'noche-bruja'
  | 'resolucion-noche'
  | 'dia-debate'
  | 'dia-votacion'
  | 'resolucion-dia'
  | 'fin';

const NIGHT_PHASES: Phase[] = ['noche-lobos', 'noche-vidente', 'noche-bruja', 'resolucion-noche'];

export default function HombreLoboLive() {
  const { code } = useParams<{ code: string }>();
  const clientRef = useRef<RoomSocketClient | null>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'reconnecting' | 'closed'>('connecting');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [phase, setPhase] = useState<Phase>('lobby');
  const [round, setRound] = useState(0);
  const [role, setRole] = useState<RoleInfo | null>(null);
  const [prompt, setPrompt] = useState<NightPrompt | null>(null);
  const [videnteReveal, setVidenteReveal] = useState<{ targetId: string; role: LoboRole } | null>(null);
  const [waitingForLobos, setWaitingForLobos] = useState(false);
  const [debateEndsAt, setDebateEndsAt] = useState<number | null>(null);
  const [debateSecondsLeft, setDebateSecondsLeft] = useState(0);
  const [voteOptions, setVoteOptions] = useState<string[]>([]);
  const [myDayVote, setMyDayVote] = useState<string | null>(null);
  const [deathLog, setDeathLog] = useState<DeathLogEntry[]>([]);
  const [finalReveal, setFinalReveal] = useState<FinalReveal | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [error, setError] = useState('');
  const [playersPerLobo, setPlayersPerLobo] = useState(4);

  const myId = (keycloak.tokenParsed as { sub?: string } | undefined)?.sub;
  const me = players.find((p) => p.id === myId);
  const connectedCount = players.filter((p) => p.connected).length;

  useEffect(() => {
    if (!code) return;

    const client = new RoomSocketClient({
      roomCode: code,
      onStatusChange: setStatus,
      onMessage: (message: WsMessage) => {
        switch (message.type) {
          case 'players-updated':
            setPlayers(message.players as PlayerInfo[]);
            break;
          case 'role-assigned': {
            const r = message.role as LoboRole;
            setRole({ role: r, description: message.description as string });
            setPhase('noche-lobos');
            setRound(1);
            setFinalReveal(null);
            setDeathLog([]);
            const nightPrompt = message.nightPrompt as { fellowLobos: string[] } | undefined;
            if (r === 'lobo' && nightPrompt) {
              setPrompt({ kind: 'lobo', fellowLobos: nightPrompt.fellowLobos });
              setWaitingForLobos(false);
            } else {
              setPrompt(null);
            }
            break;
          }
          case 'phase-changed': {
            const p = message.phase as Phase;
            setPhase(p);
            if (typeof message.round === 'number') setRound(message.round);
            if (p === 'dia-debate') {
              const ms = (message.debateMs as number) ?? 90_000;
              setDebateEndsAt(Date.now() + ms);
              setPrompt(null);
            } else if (p === 'dia-votacion') {
              setVoteOptions((message.options as string[]) ?? []);
              setMyDayVote(null);
              setPrompt(null);
            } else if (NIGHT_PHASES.includes(p)) {
              setPrompt(null);
              setVidenteReveal(null);
            }
            break;
          }
          case 'night-prompt': {
            const nightPhase = message.phase as Phase;
            if (nightPhase === 'noche-lobos') {
              setPrompt({ kind: 'lobo', fellowLobos: (message.fellowLobos as string[]) ?? [] });
              setWaitingForLobos(false);
            } else if (nightPhase === 'noche-vidente') {
              setPrompt({ kind: 'vidente', options: message.options as string[] });
            } else if (nightPhase === 'noche-bruja') {
              setPrompt({
                kind: 'bruja',
                lobosTarget: (message.lobosTarget as string | null) ?? null,
                healAvailable: message.healAvailable as boolean,
                killAvailable: message.killAvailable as boolean,
                options: message.options as string[],
              });
            }
            break;
          }
          case 'vote-registered':
            setWaitingForLobos(true);
            setPrompt(null);
            break;
          case 'vidente-reveal':
            setVidenteReveal({ targetId: message.targetId as string, role: message.role as LoboRole });
            setPrompt(null);
            break;
          case 'night-resolved': {
            const deaths = (message.deaths as string[]) ?? [];
            const r = (message.round as number) ?? round;
            setDeathLog((prev) => [...prev, ...deaths.map((playerId) => ({ playerId, round: r, when: 'noche' as const, role: null }))]);
            if (message.nextPhase === 'dia-debate') {
              setPhase('dia-debate');
              const ms = (message.debateMs as number) ?? 90_000;
              setDebateEndsAt(Date.now() + ms);
            } else {
              // No hay nextPhase: se disparó una venganza del Cazador, la
              // sala está en resolucion-noche esperando esa acción.
              setPhase('resolucion-noche');
            }
            setPrompt(null);
            setWaitingForLobos(false);
            break;
          }
          case 'cazador-revenge-prompt':
            setPrompt({ kind: 'cazador-revenge', options: message.options as string[] });
            break;
          case 'cazador-revenge-resolved': {
            const r = (message.round as number) ?? round;
            const when: 'noche' | 'dia' = phase === 'dia-debate' || phase === 'resolucion-dia' ? 'dia' : 'noche';
            setDeathLog((prev) => [
              ...prev,
              { playerId: message.targetId as string, round: r, when, role: (message.role as LoboRole | null) ?? null },
            ]);
            if (message.nextPhase === 'dia-debate') {
              setPhase('dia-debate');
              const ms = (message.debateMs as number) ?? 90_000;
              setDebateEndsAt(Date.now() + ms);
            } else {
              setPhase('noche-lobos');
              setRound(r);
            }
            setPrompt(null);
            break;
          }
          case 'day-vote-tally':
            // Sin datos por votante — solo un contador general para no filtrar votos.
            break;
          case 'day-vote-tied':
            setPhase('dia-votacion');
            setMyDayVote(null);
            break;
          case 'day-resolved': {
            const expelledId = message.expelledId as string | null;
            const r = (message.round as number) ?? round;
            if (expelledId) {
              setDeathLog((prev) => [...prev, { playerId: expelledId, round: r, when: 'dia', role: message.expelledRole as LoboRole }]);
            }
            if (message.nextPhase === 'noche-lobos') {
              setPhase('noche-lobos');
              setRound(r);
            } else {
              setPhase('resolucion-dia');
            }
            setPrompt(null);
            setVoteOptions([]);
            break;
          }
          case 'game-ended':
            setPhase('fin');
            setFinalReveal({
              winner: message.winner as 'lobos' | 'aldeanos',
              roles: message.roles as Record<string, LoboRole>,
            });
            setPrompt(null);
            break;
          case 'error':
            setError(message.message as string);
            break;
        }
      },
    });
    clientRef.current = client;
    client.connect();
    return () => client.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    if (!debateEndsAt) return;
    const tick = () => setDebateSecondsLeft(Math.max(0, Math.ceil((debateEndsAt - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [debateEndsAt]);

  function startGame() {
    clientRef.current?.send({ type: 'start-game', playersPerLobo });
  }

  function voteLobo(targetId: string) {
    clientRef.current?.send({ type: 'lobo-vote', targetId });
  }

  function videnteSee(targetId: string) {
    clientRef.current?.send({ type: 'vidente-see', targetId });
    setPrompt(null);
  }

  function brujaSubmit(action: { heal?: boolean; killTargetId?: string }) {
    clientRef.current?.send({ type: 'bruja-action', ...action });
    setPrompt(null);
  }

  function advanceToVote() {
    clientRef.current?.send({ type: 'advance-phase' });
  }

  function castDayVote(targetId: string) {
    setMyDayVote(targetId);
    clientRef.current?.send({ type: 'day-vote', targetId });
  }

  function cazadorRevenge(targetId: string) {
    clientRef.current?.send({ type: 'cazador-revenge', targetId });
    setPrompt(null);
  }

  function nameOf(id: string): string {
    return players.find((p) => p.id === id)?.username ?? id;
  }

  const isMinigameOver = phase === 'fin';
  const inHoldingScreen = NIGHT_PHASES.includes(phase) && !prompt && !videnteReveal;
  const debateAutoAdvance = debateEndsAt !== null && debateSecondsLeft === 0 && phase === 'dia-debate';

  useEffect(() => {
    if (debateAutoAdvance && me?.isHost) {
      advanceToVote();
      setDebateEndsAt(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debateAutoAdvance]);

  return (
    <div className="juego-shell">
      <div className="juego-shell-header">
        <Link to="/" className="juego-volver">← Volver</Link>
        <h1>🐺 Hombre Lobo — Sala {code}</h1>
      </div>

      <p className="juego-texto-secundario">
        Estado: {status === 'open' ? '🟢 Conectado' : status === 'reconnecting' ? '🟡 Reconectando…' : status === 'connecting' ? '🟡 Conectando…' : '🔴 Desconectado'}
      </p>
      {error && <p className="juego-error">{error}</p>}
      {deathLog.length > 0 && !isMinigameOver && (
        <div className="juego-card-central" style={{ minHeight: 'auto', gap: 6 }}>
          <h3 style={{ fontSize: 14 }}>☠️ Registro de muertes</h3>
          {deathLog.map((entry, i) => (
            <p key={i} className="juego-texto-secundario">
              Ronda {entry.round} ({entry.when}): <strong>{nameOf(entry.playerId)}</strong>
              {entry.role ? ` — ${ROLE_LABEL[entry.role]}` : ' — rol no revelado'}
            </p>
          ))}
        </div>
      )}

      <div className="juego-card-central">
        {phase === 'lobby' && (
          <>
            <h2>Jugadores en la sala</h2>
            <div className="juego-lista-jugadores">
              {players.map((p) => (
                <div key={p.id} className="juego-jugador-row">
                  <span>{p.connected ? '🟢' : '🟡'}</span>
                  <span>{p.username}{p.isHost ? ' (host)' : ''}</span>
                </div>
              ))}
            </div>
            {me?.isHost && (
              <>
                <p className="juego-texto-secundario">Jugadores por lobo (ratio configurable)</p>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <button className="juego-boton-secundario" onClick={() => setPlayersPerLobo((n) => Math.max(2, n - 1))}>−</button>
                  <span style={{ fontSize: 24, fontWeight: 700 }}>{playersPerLobo}</span>
                  <button className="juego-boton-secundario" onClick={() => setPlayersPerLobo((n) => n + 1)}>+</button>
                </div>
                <button className="juego-boton" disabled={connectedCount < 5} onClick={startGame}>
                  {connectedCount < 5 ? 'Se necesitan 5+ jugadores' : 'Empezar partida'}
                </button>
              </>
            )}
          </>
        )}

        {phase !== 'lobby' && phase !== 'fin' && role && (
          <>
            {round > 0 && <p className="juego-texto-secundario">Ronda {round}</p>}

            {!prompt && !videnteReveal && (
              <>
                <h2>{ROLE_LABEL[role.role]}</h2>
                <p className="juego-texto-secundario">{role.description}</p>
              </>
            )}

            {inHoldingScreen && waitingForLobos && (
              <p className="juego-texto-secundario">Habéis elegido — esperando al resto de lobos…</p>
            )}
            {inHoldingScreen && !waitingForLobos && (
              <p className="juego-texto-secundario">🌙 Todos cerráis los ojos — algunos jugadores están actuando…</p>
            )}

            {videnteReveal && (
              <>
                <h2>🔮 Visión</h2>
                <p><strong>{nameOf(videnteReveal.targetId)}</strong> es {ROLE_LABEL[videnteReveal.role]}</p>
              </>
            )}

            {prompt?.kind === 'lobo' && (
              <>
                <h2>🐺 Elegid a vuestra víctima</h2>
                <p className="juego-texto-secundario">
                  Lobos: {prompt.fellowLobos.map(nameOf).join(', ') || 'ninguno más'}
                </p>
                <div className="juego-lista-jugadores">
                  {players
                    .filter((p) => p.id !== myId && !prompt.fellowLobos.includes(p.id))
                    .map((p) => (
                      <button key={p.id} className="juego-boton-secundario" onClick={() => voteLobo(p.id)}>
                        Atacar a {p.username}
                      </button>
                    ))}
                </div>
              </>
            )}

            {prompt?.kind === 'vidente' && (
              <>
                <h2>🔮 Elige a quién ver</h2>
                <div className="juego-lista-jugadores">
                  {prompt.options.map((id) => (
                    <button key={id} className="juego-boton-secundario" onClick={() => videnteSee(id)}>
                      Ver a {nameOf(id)}
                    </button>
                  ))}
                </div>
              </>
            )}

            {prompt?.kind === 'bruja' && (
              <>
                <h2>🧙 Turno de la Bruja</h2>
                <p className="juego-texto-secundario">
                  Los lobos han elegido a: {prompt.lobosTarget ? nameOf(prompt.lobosTarget) : 'nadie'}
                </p>
                {prompt.healAvailable && prompt.lobosTarget && (
                  <button className="juego-boton-secundario" onClick={() => brujaSubmit({ heal: true })}>
                    💚 Curar a {nameOf(prompt.lobosTarget)}
                  </button>
                )}
                {prompt.killAvailable && (
                  <div className="juego-lista-jugadores">
                    <p className="juego-texto-secundario">☠️ O usar la poción de muerte:</p>
                    {prompt.options.map((id) => (
                      <button key={id} className="juego-boton-secundario" onClick={() => brujaSubmit({ killTargetId: id })}>
                        Matar a {nameOf(id)}
                      </button>
                    ))}
                  </div>
                )}
                <button className="juego-boton" onClick={() => brujaSubmit({})}>No hacer nada esta noche</button>
              </>
            )}

            {prompt?.kind === 'cazador-revenge' && (
              <>
                <h2>🏹 Última bala del Cazador</h2>
                <p className="juego-texto-secundario">Antes de morir, eliges a quién te llevas contigo.</p>
                <div className="juego-lista-jugadores">
                  {prompt.options.map((id) => (
                    <button key={id} className="juego-boton-secundario" onClick={() => cazadorRevenge(id)}>
                      Llevarme a {nameOf(id)}
                    </button>
                  ))}
                </div>
              </>
            )}

            {phase === 'dia-debate' && (
              <>
                <h2>☀️ Debate</h2>
                <p className="juego-texto-secundario">Discutid en voz alta quién creéis que son los lobos.</p>
                <p style={{ fontSize: 32, fontWeight: 700 }}>{debateSecondsLeft}s</p>
                {me?.isHost && <button className="juego-boton" onClick={advanceToVote}>Pasar a votación</button>}
              </>
            )}

            {phase === 'dia-votacion' && (
              <>
                <h2>🗳️ Votación</h2>
                <div className="juego-lista-jugadores">
                  {voteOptions.map((id) => (
                    <button
                      key={id}
                      className={myDayVote === id ? 'juego-boton' : 'juego-boton-secundario'}
                      onClick={() => castDayVote(id)}
                    >
                      Votar a {nameOf(id)}
                    </button>
                  ))}
                </div>
                {myDayVote && <p className="juego-texto-secundario">Voto registrado: {nameOf(myDayVote)}</p>}
              </>
            )}
          </>
        )}

        {phase === 'fin' && finalReveal && (
          <>
            <h2>🎭 Fin de la partida</h2>
            <p>{finalReveal.winner === 'aldeanos' ? '✅ Ganan los Aldeanos' : '🐺 Ganan los Lobos'}</p>
            <div className="juego-lista-jugadores">
              {Object.entries(finalReveal.roles).map(([playerId, r]) => (
                <p key={playerId}>{nameOf(playerId)}: {ROLE_LABEL[r]}</p>
              ))}
            </div>
          </>
        )}
      </div>

      <button
        className="juego-boton-secundario"
        style={{ position: 'fixed', bottom: 20, right: 20, borderRadius: '50%', width: 48, height: 48, fontSize: 20 }}
        onClick={() => setRulesOpen(true)}
        aria-label="Ver reglas"
      >
        ?
      </button>

      {rulesOpen && (
        <div
          role="dialog"
          aria-label="Reglas de Hombre Lobo"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 50,
          }}
          onClick={() => setRulesOpen(false)}
        >
          <div
            className="juego-card-central"
            style={{ maxWidth: 420, maxHeight: '80vh', overflowY: 'auto', textAlign: 'left', alignItems: 'stretch' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>📖 Reglas — roles</h2>
            {RULE_CARDS.map((card) => (
              <div key={card.role} style={{ marginBottom: 12 }}>
                <h3 style={{ fontSize: 15 }}>{ROLE_LABEL[card.role]}</h3>
                <p className="juego-texto-secundario">{card.text}</p>
              </div>
            ))}
            <button className="juego-boton" onClick={() => setRulesOpen(false)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
