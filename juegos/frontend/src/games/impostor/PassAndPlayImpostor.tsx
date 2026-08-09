import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getImpostorWord, newSessionId } from '../../services/api';
import '../shared.css';

// Bucle de eliminación de El Impostor en pass-and-play: la lógica se duplica
// intencionalmente respecto a backend/src/games/impostorGame.ts (mismo
// comentario que ya existía antes de este cambio) porque el modo
// pass-and-play no tiene estado en el servidor — solo el backend sirve la
// palabra. Ver design.md "El Impostor: elimination loop, not single-round
// reveal" y spec.md "El Impostor elimination loop (pass-and-play and live)".

type Phase =
  | 'setup-count'
  | 'setup-names'
  | 'setup-impostors'
  | 'revealing'
  | 'discussion'
  | 'voting'
  | 'eliminated'
  | 'final';

const CATEGORIAS = ['comida', 'animales', 'objetosCotidianos', 'profesiones', 'lugares', 'deportes'];
const DISCUSSION_SECONDS = 120;
const MIN_PLAYERS = 4;

interface PlayerEntry {
  id: string;
  name: string;
}

function maxImpostors(playerCount: number): number {
  return Math.floor((playerCount - 1) / 2);
}

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function PassAndPlayImpostor() {
  const sessionId = useMemo(() => newSessionId(), []);
  const [phase, setPhase] = useState<Phase>('setup-count');
  const [playerCount, setPlayerCount] = useState(MIN_PLAYERS);
  const [players, setPlayers] = useState<PlayerEntry[]>([]);
  const [impostorCount, setImpostorCount] = useState(1);
  const [categoria, setCategoria] = useState('');
  const [word, setWord] = useState('');
  const [category, setCategory] = useState('');
  const [impostorIds, setImpostorIds] = useState<Set<string>>(new Set());
  const [alive, setAlive] = useState<string[]>([]);
  const [eliminated, setEliminated] = useState<string[]>([]);
  const [revealIndex, setRevealIndex] = useState(0);
  const [cardShown, setCardShown] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(DISCUSSION_SECONDS);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [lastEliminatedId, setLastEliminatedId] = useState<string | null>(null);
  const [winner, setWinner] = useState<'crew' | 'impostors' | null>(null);
  const [error, setError] = useState('');

  function confirmPlayerCount() {
    setPlayers(
      Array.from({ length: playerCount }, (_, i) => ({ id: `p${i}`, name: `Jugador ${i + 1}` })),
    );
    setPhase('setup-names');
  }

  function updateName(id: string, name: string) {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }

  function confirmNames() {
    setImpostorCount(1);
    setPhase('setup-impostors');
  }

  async function startGame() {
    setError('');
    try {
      const res = await getImpostorWord(sessionId, categoria || undefined);
      setWord(res.word);
      setCategory(res.category);

      const ids = players.map((p) => p.id);
      const chosenImpostors = new Set(shuffle(ids).slice(0, impostorCount));
      setImpostorIds(chosenImpostors);
      setAlive(ids);
      setEliminated([]);
      setWinner(null);
      setRevealIndex(0);
      setCardShown(false);
      setVotes({});
      setPhase('revealing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo obtener la palabra');
    }
  }

  function nextReveal() {
    if (revealIndex + 1 >= players.length) {
      setSecondsLeft(DISCUSSION_SECONDS);
      setPhase('discussion');
      startTimer();
      return;
    }
    setRevealIndex((i) => i + 1);
    setCardShown(false);
  }

  function startTimer() {
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          setPhase('voting');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  function castVote(voterId: string, votedForId: string) {
    setVotes((prev) => {
      const next = { ...prev, [voterId]: votedForId };
      if (Object.keys(next).length >= alive.length) {
        resolveRound(next);
      }
      return next;
    });
  }

  function resolveRound(finalVotes: Record<string, string>) {
    const counts: Record<string, number> = {};
    for (const votedForId of Object.values(finalVotes)) {
      counts[votedForId] = (counts[votedForId] ?? 0) + 1;
    }
    let mostVotedId: string | null = null;
    let maxVotes = 0;
    let tie = false;
    for (const [id, count] of Object.entries(counts)) {
      if (count > maxVotes) {
        maxVotes = count;
        mostVotedId = id;
        tie = false;
      } else if (count === maxVotes && maxVotes > 0) {
        tie = true;
      }
    }
    const eliminatedId = tie ? null : mostVotedId;

    if (!eliminatedId) {
      setLastEliminatedId(null);
      setVotes({});
      setPhase('eliminated');
      return;
    }

    const nextAlive = alive.filter((id) => id !== eliminatedId);
    setAlive(nextAlive);
    setEliminated((prev) => [...prev, eliminatedId]);
    setLastEliminatedId(eliminatedId);
    setVotes({});

    const aliveImpostors = nextAlive.filter((id) => impostorIds.has(id));
    if (aliveImpostors.length === 0) {
      setWinner('crew');
      setPhase('final');
      return;
    }
    if (nextAlive.length === 3) {
      setWinner('impostors');
      setPhase('final');
      return;
    }
    setPhase('eliminated');
  }

  function continueAfterElimination() {
    setSecondsLeft(DISCUSSION_SECONDS);
    setPhase('discussion');
    startTimer();
  }

  function nameOf(id: string): string {
    return players.find((p) => p.id === id)?.name ?? id;
  }

  const currentImpostorMax = maxImpostors(players.length || playerCount);

  return (
    <div className="juego-shell">
      <div className="juego-shell-header">
        <Link to="/" className="juego-volver">← Volver</Link>
        <h1>🕵️ El Impostor</h1>
      </div>

      {phase === 'setup-count' && (
        <div className="juego-card-central">
          <label className="juego-texto-secundario">Número de jugadores (mínimo {MIN_PLAYERS})</label>
          <input
            className="juego-input"
            type="number"
            min={MIN_PLAYERS}
            max={20}
            value={playerCount}
            onChange={(e) => setPlayerCount(Math.max(MIN_PLAYERS, Number(e.target.value) || MIN_PLAYERS))}
          />
          <label className="juego-texto-secundario">Categoría (opcional)</label>
          <select className="juego-input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button className="juego-boton" onClick={confirmPlayerCount}>Siguiente: nombres</button>
        </div>
      )}

      {phase === 'setup-names' && (
        <div className="juego-card-central">
          <h2>Nombres de los jugadores</h2>
          <div className="juego-lista-jugadores">
            {players.map((p) => (
              <input
                key={p.id}
                className="juego-input"
                value={p.name}
                onChange={(e) => updateName(p.id, e.target.value)}
              />
            ))}
          </div>
          <button className="juego-boton" onClick={confirmNames}>Siguiente: impostores</button>
        </div>
      )}

      {phase === 'setup-impostors' && (
        <div className="juego-card-central">
          <h2>¿Cuántos impostores?</h2>
          <p className="juego-texto-secundario">Máximo {currentImpostorMax} para {players.length} jugadores</p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              className="juego-boton-secundario"
              onClick={() => setImpostorCount((n) => Math.max(1, n - 1))}
            >
              −
            </button>
            <span style={{ fontSize: 32, fontWeight: 700 }}>{impostorCount}</span>
            <button
              className="juego-boton-secundario"
              onClick={() => setImpostorCount((n) => Math.min(currentImpostorMax, n + 1))}
            >
              +
            </button>
          </div>
          {error && <p className="juego-error">{error}</p>}
          <button className="juego-boton" onClick={startGame}>Empezar ronda</button>
        </div>
      )}

      {phase === 'revealing' && (
        <div className="juego-card-central">
          <p className="juego-texto-secundario">Pasa el móvil a {nameOf(players[revealIndex].id)}</p>
          {!cardShown ? (
            <button className="juego-boton" onClick={() => setCardShown(true)}>Toca para ver tu rol</button>
          ) : (
            <>
              {impostorIds.has(players[revealIndex].id) ? (
                <>
                  <h2>😈 Eres el Impostor</h2>
                  <p className="juego-texto-secundario">No conoces la palabra. ¡Disimula!</p>
                </>
              ) : (
                <>
                  <h2>{word}</h2>
                  <p className="juego-texto-secundario">Categoría: {category}</p>
                </>
              )}
              <button className="juego-boton" onClick={nextReveal}>
                {revealIndex + 1 >= players.length ? 'Empezar debate' : 'Siguiente jugador'}
              </button>
            </>
          )}
        </div>
      )}

      {phase === 'discussion' && (
        <div className="juego-card-central">
          <h2>🗣️ Debate</h2>
          <p className="juego-texto-secundario">Comentad pistas sobre la palabra sin decirla</p>
          <p style={{ fontSize: 40, fontWeight: 700 }}>{secondsLeft}s</p>
          <button className="juego-boton-secundario" onClick={() => setPhase('voting')}>Pasar a votación</button>
        </div>
      )}

      {phase === 'voting' && (
        <div className="juego-card-central">
          <h2>🗳️ Votación</h2>
          <p className="juego-texto-secundario">
            Voto {Object.keys(votes).length + 1} de {alive.length} — ¿quién es el impostor?
          </p>
          <p className="juego-texto-secundario">Pasa el móvil de jugador en jugador para votar</p>
          <div className="juego-lista-jugadores">
            {alive
              .filter((id) => !(id in votes))
              .slice(0, 1)
              .map((voterId) => (
                <div key={voterId}>
                  <p className="juego-texto-secundario">Vota {nameOf(voterId)}:</p>
                  {alive
                    .filter((id) => id !== voterId)
                    .map((candidateId) => (
                      <button
                        key={candidateId}
                        className="juego-boton-secundario"
                        onClick={() => castVote(voterId, candidateId)}
                      >
                        {nameOf(candidateId)}
                      </button>
                    ))}
                </div>
              ))}
          </div>
        </div>
      )}

      {phase === 'eliminated' && (
        <div className="juego-card-central">
          <h2>☠️ Resultado de la ronda</h2>
          {lastEliminatedId ? (
            <p>
              <strong>{nameOf(lastEliminatedId)}</strong> ha sido eliminado/a
            </p>
          ) : (
            <p>Empate en la votación — nadie ha sido eliminado esta ronda</p>
          )}
          <p className="juego-texto-secundario">
            El juego no revela si era o no el impostor — eso solo se sabe en la revelación final.
          </p>
          <p className="juego-texto-secundario">Jugadores en juego: {alive.length}</p>
          <button className="juego-boton" onClick={continueAfterElimination}>Continuar debate</button>
        </div>
      )}

      {phase === 'final' && (
        <div className="juego-card-central">
          <h2>🎭 Revelación final</h2>
          <p className="juego-texto-secundario">La palabra era: {word}</p>
          <p>
            {winner === 'crew' ? '✅ Ganan los tripulantes' : '😈 Ganan los impostores'}
          </p>
          <div className="juego-lista-jugadores">
            {players.map((p) => (
              <p key={p.id}>
                {p.name}: {impostorIds.has(p.id) ? '😈 Impostor' : '🙂 Tripulante'}
                {eliminated.includes(p.id) ? ' (eliminado/a)' : ''}
              </p>
            ))}
          </div>
          <button className="juego-boton" onClick={() => setPhase('setup-count')}>Otra partida</button>
        </div>
      )}
    </div>
  );
}
