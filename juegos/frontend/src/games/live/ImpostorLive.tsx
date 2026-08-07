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

type Role = { isImpostor: boolean; word: string | null; categoria: string } | null;

export default function ImpostorLive() {
  const { code } = useParams<{ code: string }>();
  const clientRef = useRef<RoomSocketClient | null>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'reconnecting' | 'closed'>('connecting');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [role, setRole] = useState<Role>(null);
  const [phase, setPhase] = useState<'lobby' | 'roles' | 'voting' | 'reveal'>('lobby');
  const [tally, setTally] = useState<{ counts: Record<string, number>; allVoted: boolean } | null>(null);
  const [reveal, setReveal] = useState<{ impostorId: string; word: string; wasImpostorCaught: boolean } | null>(null);
  const [error, setError] = useState('');

  const myId = (keycloak.tokenParsed as { sub?: string } | undefined)?.sub;
  const me = players.find((p) => p.id === myId);

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
            setReveal(null);
            setTally(null);
            break;
          case 'role-assigned':
            setRole({ isImpostor: message.isImpostor as boolean, word: message.word as string | null, categoria: message.categoria as string });
            break;
          case 'vote-tally':
            setPhase('voting');
            setTally({ counts: message.counts as Record<string, number>, allVoted: message.allVoted as boolean });
            break;
          case 'reveal':
            setPhase('reveal');
            setReveal({
              impostorId: message.impostorId as string,
              word: message.word as string,
              wasImpostorCaught: message.wasImpostorCaught as boolean,
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
  }, [code]);

  function startRound() {
    clientRef.current?.send({ type: 'start-round' });
  }

  function vote(votedForId: string) {
    clientRef.current?.send({ type: 'vote', votedForId });
  }

  function forceReveal() {
    clientRef.current?.send({ type: 'reveal' });
  }

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
              <button className="juego-boton" disabled={players.length < 3} onClick={startRound}>
                {players.length < 3 ? 'Se necesitan 3+ jugadores' : 'Empezar ronda'}
              </button>
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
            <div className="juego-lista-jugadores">
              {players.map((p) => (
                <button key={p.id} className="juego-boton-secundario" onClick={() => vote(p.id)}>
                  Votar a {p.username}
                </button>
              ))}
            </div>
          </>
        )}

        {phase === 'voting' && tally && (
          <>
            <h2>🗳️ Votos</h2>
            {Object.entries(tally.counts).map(([id, n]) => (
              <p key={id}>{players.find((p) => p.id === id)?.username ?? id}: {n} voto(s)</p>
            ))}
            {me?.isHost && (
              <button className="juego-boton" onClick={forceReveal}>Revelar resultado</button>
            )}
          </>
        )}

        {phase === 'reveal' && reveal && (
          <>
            <h2>🎭 Revelación</h2>
            <p>El impostor era: <strong>{players.find((p) => p.id === reveal.impostorId)?.username}</strong></p>
            <p className="juego-texto-secundario">La palabra era: {reveal.word}</p>
            <p>{reveal.wasImpostorCaught ? '✅ ¡Cazado!' : '❌ Escapó'}</p>
            {me?.isHost && (
              <button className="juego-boton" onClick={startRound}>Nueva ronda</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
