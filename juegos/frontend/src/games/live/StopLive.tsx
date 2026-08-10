import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import keycloak from '../../services/keycloak';
import { RoomSocketClient, type WsMessage } from '../../services/ws';
import '../shared.css';

// ─────────────────────────────────────────────────────────────────────────
// Stop / Basta / Tutti Frutti — ver design.md "Stop / Basta" y
// backend/src/games/stopLive.ts. Envíos parciales/incrementales permitidos
// mientras la ronda está activa; el primer "¡Stop!" corta la ronda para
// todos de inmediato. La app no valida si las palabras son reales — el
// grupo lo hace en voz alta (fuera del alcance de la app).
// ─────────────────────────────────────────────────────────────────────────

interface PlayerInfo {
  id: string;
  username: string;
  isHost: boolean;
  connected: boolean;
}

interface GridCell {
  value: string;
  points: number;
}

interface ScoreRow {
  playerId: string;
  username: string;
  score: number;
}

type Phase = 'lobby' | 'active' | 'stopped';

export default function StopLive() {
  const { code } = useParams<{ code: string }>();
  const clientRef = useRef<RoomSocketClient | null>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'reconnecting' | 'closed'>('connecting');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [phase, setPhase] = useState<Phase>('lobby');
  const [letter, setLetter] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [stoppedBy, setStoppedBy] = useState<string | null>(null);
  const [grid, setGrid] = useState<Record<string, Record<string, GridCell>> | null>(null);
  const [scoreboard, setScoreboard] = useState<ScoreRow[] | null>(null);
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
            setPhase('active');
            setLetter(message.letter as string);
            setCategories(message.categories as string[]);
            setAnswers({});
            setStoppedBy(null);
            setGrid(null);
            setScoreboard(null);
            break;
          case 'round-stopped':
            setPhase('stopped');
            setStoppedBy(message.stoppedBy as string);
            setGrid(message.grid as Record<string, Record<string, GridCell>>);
            setScoreboard(message.scoreboard as ScoreRow[]);
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

  function updateAnswer(category: string, value: string) {
    setAnswers((prev) => ({ ...prev, [category]: value }));
    clientRef.current?.send({ type: 'submit', category, value });
  }

  function callStop() {
    clientRef.current?.send({ type: 'stop' });
  }

  function nameOf(id: string | null): string {
    if (!id) return '—';
    return players.find((p) => p.id === id)?.username ?? id;
  }

  return (
    <div className="juego-shell">
      <div className="juego-shell-header">
        <Link to="/" className="juego-volver">← Volver</Link>
        <h1>✋ Stop / Basta — Sala {code}</h1>
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
              <button className="juego-boton" disabled={players.length < 2} onClick={startRound}>
                {players.length < 2 ? 'Se necesitan 2+ jugadores' : 'Empezar ronda'}
              </button>
            )}
          </>
        )}

        {phase === 'active' && (
          <>
            <h2>Letra: {letter}</h2>
            <div className="juego-lista-jugadores" style={{ width: '100%' }}>
              {categories.map((cat) => (
                <div key={cat} style={{ width: '100%', textAlign: 'left' }}>
                  <label className="juego-texto-secundario">{cat}</label>
                  <input
                    className="juego-input"
                    value={answers[cat] ?? ''}
                    onChange={(e) => updateAnswer(cat, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <button className="juego-boton" onClick={callStop}>¡Stop!</button>
          </>
        )}

        {phase === 'stopped' && grid && scoreboard && (
          <>
            <h2>✋ ¡Stop! (llamado por {nameOf(stoppedBy)})</h2>
            <p className="juego-texto-secundario">Revisad en voz alta si las respuestas son válidas.</p>
            <div className="juego-lista-jugadores" style={{ width: '100%' }}>
              {players.map((p) => (
                <div key={p.id} style={{ width: '100%', textAlign: 'left' }}>
                  <strong>{p.username}</strong>
                  <div className="juego-lista-jugadores">
                    {categories.map((cat) => {
                      const cell = grid[p.id]?.[cat];
                      return (
                        <div key={cat} className="juego-jugador-row">
                          <span>{cat}: {cell?.value || '(vacío)'}</span>
                          <span>{cell?.points ?? 0} pt(s)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <h3>Marcador acumulado</h3>
            <div className="juego-lista-jugadores">
              {scoreboard.map((row) => (
                <div key={row.playerId} className="juego-jugador-row">
                  <span>{row.username}</span>
                  <span>{row.score} pt(s)</span>
                </div>
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
