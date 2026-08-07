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

interface Question {
  categoria: string;
  pregunta: string;
  opciones: string[];
  timerMs: number;
  questionNumber: number;
}

interface ScoreRow {
  playerId: string;
  username: string;
  score: number;
}

export default function TriviaLive() {
  const { code } = useParams<{ code: string }>();
  const clientRef = useRef<RoomSocketClient | null>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'reconnecting' | 'closed'>('connecting');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [question, setQuestion] = useState<Question | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [correcta, setCorrecta] = useState<string | null>(null);
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
          case 'question':
            setQuestion({
              categoria: message.categoria as string,
              pregunta: message.pregunta as string,
              opciones: message.opciones as string[],
              timerMs: message.timerMs as number,
              questionNumber: message.questionNumber as number,
            });
            setRemainingMs(message.timerMs as number);
            setAnswered(false);
            setSelected(null);
            setAnsweredCount(0);
            setCorrecta(null);
            setScoreboard(null);
            break;
          case 'answer-received':
            setAnsweredCount(message.answeredCount as number);
            break;
          case 'question-closed':
            setCorrecta(message.correcta as string);
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

  // Countdown local del temporizador de la pregunta actual.
  useEffect(() => {
    if (!question || correcta) return;
    const startedAt = Date.now();
    const total = question.timerMs;
    const interval = setInterval(() => {
      const left = Math.max(0, total - (Date.now() - startedAt));
      setRemainingMs(left);
      if (left <= 0) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.questionNumber, correcta]);

  function startQuestion() {
    clientRef.current?.send({ type: 'start-question' });
  }

  function submitAnswer(option: string) {
    if (answered || remainingMs <= 0) return;
    setSelected(option);
    setAnswered(true);
    clientRef.current?.send({ type: 'answer', answer: option });
  }

  function closeQuestion() {
    clientRef.current?.send({ type: 'close-question' });
  }

  return (
    <div className="juego-shell">
      <div className="juego-shell-header">
        <Link to="/" className="juego-volver">← Volver</Link>
        <h1>🧠 Trivia en vivo — Sala {code}</h1>
      </div>

      <p className="juego-texto-secundario">
        Estado: {status === 'open' ? '🟢 Conectado' : status === 'reconnecting' ? '🟡 Reconectando…' : status === 'connecting' ? '🟡 Conectando…' : '🔴 Desconectado'}
      </p>
      {error && <p className="juego-error">{error}</p>}

      <div className="juego-card-central">
        {!question && (
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
              <button className="juego-boton" disabled={players.length < 2} onClick={startQuestion}>
                {players.length < 2 ? 'Se necesitan 2+ jugadores' : 'Lanzar pregunta'}
              </button>
            )}
          </>
        )}

        {question && !correcta && (
          <>
            <p className="juego-texto-secundario">
              Pregunta {question.questionNumber} · {question.categoria} · ⏱️ {Math.ceil(remainingMs / 1000)}s
            </p>
            <h2>{question.pregunta}</h2>
            <div className="juego-lista-jugadores">
              {question.opciones.map((opcion) => (
                <button
                  key={opcion}
                  className={opcion === selected ? 'juego-boton' : 'juego-boton-secundario'}
                  disabled={answered || remainingMs <= 0}
                  onClick={() => submitAnswer(opcion)}
                >
                  {opcion}
                </button>
              ))}
            </div>
            <p className="juego-texto-secundario">{answeredCount} jugador(es) han respondido</p>
            {me?.isHost && (
              <button className="juego-boton" onClick={closeQuestion}>Cerrar pregunta</button>
            )}
          </>
        )}

        {correcta && scoreboard && (
          <>
            <h2>✅ Respuesta correcta: {correcta}</h2>
            <h3>Marcador</h3>
            <div className="juego-lista-jugadores">
              {scoreboard.map((row) => (
                <div key={row.playerId} className="juego-jugador-row">
                  <span>{row.username}</span>
                  <span>{row.score} pt(s)</span>
                </div>
              ))}
            </div>
            {me?.isHost && (
              <button className="juego-boton" onClick={startQuestion}>Siguiente pregunta</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
