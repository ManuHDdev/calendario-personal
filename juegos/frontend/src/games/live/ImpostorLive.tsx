import { useEffect, useMemo, useRef, useState } from 'react';
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

type Role = { isImpostor: boolean; word: string | null; categoria: string } | null;
type Phase = 'lobby' | 'roles' | 'voting' | 'eliminated' | 'final';

const MIN_PLAYERS = 4;

function maxImpostors(playerCount: number): number {
  return Math.floor((playerCount - 1) / 2);
}

export default function ImpostorLive() {
  const { code } = useParams<{ code: string }>();
  const clientRef = useRef<RoomSocketClient | null>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'reconnecting' | 'closed'>('connecting');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [role, setRole] = useState<Role>(null);
  const [phase, setPhase] = useState<Phase>('lobby');
  const [impostorCount, setImpostorCount] = useState(1);
  const [alivePlayerIds, setAlivePlayerIds] = useState<string[]>([]);
  const [tally, setTally] = useState<{ counts: Record<string, number>; allVoted: boolean } | null>(null);
  const [lastEliminatedId, setLastEliminatedId] = useState<string | null>(null);
  const [finalReveal, setFinalReveal] = useState<{ word: string; impostorIds: string[]; winner: 'crew' | 'impostors' } | null>(
    null,
  );
  const [error, setError] = useState('');

  const myId = (keycloak.tokenParsed as { sub?: string } | undefined)?.sub;
  const me = players.find((p) => p.id === myId);
  const connectedCount = players.filter((p) => p.connected).length;
  const currentImpostorMax = useMemo(() => maxImpostors(connectedCount), [connectedCount]);

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
          case 'round-started':
            setPhase('roles');
            setFinalReveal(null);
            setTally(null);
            setLastEliminatedId(null);
            // Se resetea al arrancar una ronda nueva; hasta la primera
            // eliminación, la lista de "vivos" es simplemente todos los
            // jugadores de la sala (ver el fallback de `aliveIds` más abajo).
            setAlivePlayerIds([]);
            break;
          case 'role-assigned':
            setRole({ isImpostor: message.isImpostor as boolean, word: message.word as string | null, categoria: message.categoria as string });
            break;
          case 'vote-tally':
            setPhase('voting');
            setTally({ counts: message.counts as Record<string, number>, allVoted: message.allVoted as boolean });
            break;
          case 'round-eliminated':
            setPhase('eliminated');
            setLastEliminatedId((message.eliminatedId as string | null) ?? null);
            setAlivePlayerIds(message.alive as string[]);
            setTally(null);
            break;
          case 'game-ended':
            setPhase('final');
            setFinalReveal({
              word: message.word as string,
              impostorIds: message.impostorIds as string[],
              winner: message.winner as 'crew' | 'impostors',
            });
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

  function startRound() {
    clientRef.current?.send({ type: 'start-round', impostorCount });
  }

  function vote(votedForId: string) {
    clientRef.current?.send({ type: 'vote', votedForId });
  }

  function resolveRound() {
    clientRef.current?.send({ type: 'resolve-round' });
  }

  function continueAfterElimination() {
    setPhase('roles');
  }

  function nameOf(id: string): string {
    return players.find((p) => p.id === id)?.username ?? id;
  }

  const aliveIds = alivePlayerIds.length ? alivePlayerIds : players.map((p) => p.id);
  const iAmAlive = !myId || aliveIds.includes(myId);

  return (
    <div className="juego-shell">
      <div className="juego-shell-header">
        <Link to="/" className="juego-volver">← Volver</Link>
        <h1>📱 Impostor en vivo — Sala {code}</h1>
      </div>

      <p className="juego-texto-secundario">
        Estado: {status === 'open' ? '🟢 Conectado' : status === 'reconnecting' ? '🟡 Reconectando…' : status === 'connecting' ? '🟡 Conectando…' : '🔴 Desconectado'}
      </p>
      {error && <p className="juego-error">{error}</p>}

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
                <p className="juego-texto-secundario">
                  Número de impostores (máximo {currentImpostorMax} para {connectedCount} jugadores conectados)
                </p>
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
                    onClick={() => setImpostorCount((n) => Math.min(Math.max(1, currentImpostorMax), n + 1))}
                  >
                    +
                  </button>
                </div>
                <button className="juego-boton" disabled={connectedCount < MIN_PLAYERS} onClick={startRound}>
                  {connectedCount < MIN_PLAYERS ? `Se necesitan ${MIN_PLAYERS}+ jugadores` : 'Empezar ronda'}
                </button>
              </>
            )}
          </>
        )}

        {phase === 'roles' && role && (
          <>
            {role.isImpostor ? (
              <>
                <h2>😈 Eres el Impostor</h2>
                <p className="juego-texto-secundario">No conoces la palabra. ¡Disimula!</p>
              </>
            ) : (
              <>
                <h2>{role.word}</h2>
                <p className="juego-texto-secundario">Categoría: {role.categoria}</p>
              </>
            )}
            <p className="juego-texto-secundario">Debatid en voz alta y votad cuando estéis listos</p>
            {iAmAlive ? (
              <div className="juego-lista-jugadores">
                {players
                  .filter((p) => aliveIds.includes(p.id))
                  .map((p) => (
                    <button key={p.id} className="juego-boton-secundario" onClick={() => vote(p.id)}>
                      Votar a {p.username}
                    </button>
                  ))}
              </div>
            ) : (
              <p className="juego-texto-secundario">Has sido eliminado/a — sigue viendo la partida</p>
            )}
          </>
        )}

        {phase === 'voting' && tally && (
          <>
            <h2>🗳️ Votos</h2>
            {Object.entries(tally.counts).map(([id, n]) => (
              <p key={id}>{nameOf(id)}: {n} voto(s)</p>
            ))}
            {me?.isHost && (
              <button className="juego-boton" onClick={resolveRound}>Resolver ronda</button>
            )}
          </>
        )}

        {phase === 'eliminated' && (
          <>
            <h2>☠️ Resultado de la ronda</h2>
            {lastEliminatedId ? (
              <p><strong>{nameOf(lastEliminatedId)}</strong> ha sido eliminado/a</p>
            ) : (
              <p>Empate en la votación — nadie ha sido eliminado esta ronda</p>
            )}
            <p className="juego-texto-secundario">
              No se revela si era o no el impostor — eso solo se sabe en la revelación final.
            </p>
            {me?.isHost && (
              <button className="juego-boton" onClick={continueAfterElimination}>Continuar debate</button>
            )}
          </>
        )}

        {phase === 'final' && finalReveal && (
          <>
            <h2>🎭 Revelación final</h2>
            <p className="juego-texto-secundario">La palabra era: {finalReveal.word}</p>
            <p>{finalReveal.winner === 'crew' ? '✅ Ganan los tripulantes' : '😈 Ganan los impostores'}</p>
            <div className="juego-lista-jugadores">
              {players.map((p) => (
                <p key={p.id}>
                  {p.username}: {finalReveal.impostorIds.includes(p.id) ? '😈 Impostor' : '🙂 Tripulante'}
                </p>
              ))}
            </div>
            {me?.isHost && (
              <button className="juego-boton" onClick={startRound}>Nueva ronda</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
