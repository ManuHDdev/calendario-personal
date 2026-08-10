import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import keycloak from '../../services/keycloak';
import { RoomSocketClient, type WsMessage } from '../../services/ws';
import '../shared.css';

// ─────────────────────────────────────────────────────────────────────────
// Respuestas falsas (Fibbage-style) — ver design.md "Respuestas falsas" y
// backend/src/games/respuestasFalsasLive.ts. La respuesta real NUNCA viaja
// al cliente antes del reveal: el backend solo manda `pregunta`, luego una
// lista de opciones opacas `{id, text}` para votar, y solo en el mensaje
// `reveal` se desvela cuál era la real y quién escribió cada falsa.
// ─────────────────────────────────────────────────────────────────────────

interface PlayerInfo {
  id: string;
  username: string;
  isHost: boolean;
  connected: boolean;
}

interface VoteOption {
  id: string;
  text: string;
}

interface RevealedOption extends VoteOption {
  authorId: string | null;
  isReal: boolean;
  votes: string[];
}

interface ScoreRow {
  playerId: string;
  username: string;
  score: number;
}

type Phase = 'lobby' | 'submitting' | 'voting' | 'reveal';

export default function RespuestasFalsasLive() {
  const { code } = useParams<{ code: string }>();
  const clientRef = useRef<RoomSocketClient | null>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'reconnecting' | 'closed'>('connecting');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [phase, setPhase] = useState<Phase>('lobby');
  const [pregunta, setPregunta] = useState('');
  const [submittedCount, setSubmittedCount] = useState(0);
  const [mySubmission, setMySubmission] = useState('');
  const [answerInput, setAnswerInput] = useState('');
  const [options, setOptions] = useState<VoteOption[]>([]);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [votesCount, setVotesCount] = useState(0);
  const [reveal, setReveal] = useState<{ realOptionId: string; options: RevealedOption[] } | null>(null);
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
            setPhase('submitting');
            setPregunta(message.pregunta as string);
            setSubmittedCount(0);
            setMySubmission('');
            setAnswerInput('');
            setOptions([]);
            setMyVote(null);
            setVotesCount(0);
            setReveal(null);
            setScoreboard(null);
            break;
          case 'answer-submitted':
            setSubmittedCount(message.submittedCount as number);
            break;
          case 'voting-open':
            setPhase('voting');
            setOptions(message.options as VoteOption[]);
            break;
          case 'vote-received':
            setVotesCount(message.votesCount as number);
            break;
          case 'reveal':
            setPhase('reveal');
            setReveal({
              realOptionId: message.realOptionId as string,
              options: message.options as RevealedOption[],
            });
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

  function startQuestion() {
    clientRef.current?.send({ type: 'start-question' });
  }

  function submitAnswer() {
    const trimmed = answerInput.trim();
    if (!trimmed) return;
    setMySubmission(trimmed);
    clientRef.current?.send({ type: 'submit-answer', answer: trimmed });
  }

  function forceVoting() {
    clientRef.current?.send({ type: 'force-voting' });
  }

  function vote(optionId: string) {
    if (myVote) return;
    setMyVote(optionId);
    clientRef.current?.send({ type: 'vote', optionId });
  }

  function forceReveal() {
    clientRef.current?.send({ type: 'force-reveal' });
  }

  function nameOf(id: string | null): string {
    if (!id) return '—';
    return players.find((p) => p.id === id)?.username ?? id;
  }

  return (
    <div className="juego-shell">
      <div className="juego-shell-header">
        <Link to="/" className="juego-volver">← Volver</Link>
        <h1>🤥 Respuestas falsas — Sala {code}</h1>
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
              <button className="juego-boton" disabled={players.length < 3} onClick={startQuestion}>
                {players.length < 3 ? 'Se necesitan 3+ jugadores' : 'Lanzar pregunta'}
              </button>
            )}
          </>
        )}

        {phase === 'submitting' && (
          <>
            <h2>{pregunta}</h2>
            {!mySubmission ? (
              <>
                <input
                  className="juego-input"
                  placeholder="Escribe una respuesta falsa creíble…"
                  value={answerInput}
                  onChange={(e) => setAnswerInput(e.target.value)}
                />
                <button className="juego-boton" disabled={!answerInput.trim()} onClick={submitAnswer}>
                  Enviar respuesta
                </button>
              </>
            ) : (
              <p className="juego-texto-secundario">Tu respuesta: «{mySubmission}» — esperando al resto…</p>
            )}
            <p className="juego-texto-secundario">{submittedCount} jugador(es) han enviado su respuesta</p>
            {me?.isHost && (
              <button className="juego-boton-secundario" onClick={forceVoting}>Forzar apertura de votación</button>
            )}
          </>
        )}

        {phase === 'voting' && (
          <>
            <h2>{pregunta}</h2>
            <p className="juego-texto-secundario">¿Cuál crees que es la respuesta real? (no puedes votar la tuya)</p>
            <div className="juego-lista-jugadores">
              {options.map((opt) => (
                <button
                  key={opt.id}
                  className={opt.id === myVote ? 'juego-boton' : 'juego-boton-secundario'}
                  disabled={!!myVote}
                  onClick={() => vote(opt.id)}
                >
                  {opt.text}
                </button>
              ))}
            </div>
            <p className="juego-texto-secundario">{votesCount} jugador(es) han votado</p>
            {me?.isHost && (
              <button className="juego-boton-secundario" onClick={forceReveal}>Forzar revelación</button>
            )}
          </>
        )}

        {phase === 'reveal' && reveal && scoreboard && (
          <>
            <h2>🎭 Revelación</h2>
            <div className="juego-lista-jugadores">
              {reveal.options.map((opt) => (
                <div key={opt.id} className="juego-jugador-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span>
                    {opt.isReal ? '✅' : '🤥'} {opt.text}
                    {!opt.isReal && ` — escrita por ${nameOf(opt.authorId)}`}
                  </span>
                  {opt.votes.length > 0 && (
                    <span className="juego-texto-secundario">
                      Votada por: {opt.votes.map((v) => nameOf(v)).join(', ')}
                    </span>
                  )}
                </div>
              ))}
            </div>
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
