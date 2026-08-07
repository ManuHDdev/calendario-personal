import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getImpostorWord, newSessionId } from '../../services/api';
import '../shared.css';

type Phase = 'setup' | 'revealing' | 'discussion' | 'voting' | 'result';

const CATEGORIAS = ['comida', 'animales', 'objetosCotidianos', 'profesiones', 'lugares', 'deportes'];
const DISCUSSION_SECONDS = 120;

export default function PassAndPlayImpostor() {
  const sessionId = useMemo(() => newSessionId(), []);
  const [phase, setPhase] = useState<Phase>('setup');
  const [playerCount, setPlayerCount] = useState(4);
  const [categoria, setCategoria] = useState('');
  const [word, setWord] = useState('');
  const [category, setCategory] = useState('');
  const [impostorIndex, setImpostorIndex] = useState(0);
  const [revealIndex, setRevealIndex] = useState(0);
  const [cardShown, setCardShown] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(DISCUSSION_SECONDS);
  const [votes, setVotes] = useState<number[]>([]);
  const [error, setError] = useState('');

  async function startRound() {
    setError('');
    try {
      const res = await getImpostorWord(sessionId, categoria || undefined);
      setWord(res.word);
      setCategory(res.category);
      // La asignación de impostor es local al pass-and-play (el backend no
      // conoce el número de jugadores en este modo, solo sirve el banco de
      // palabras) — misma lógica simple que games/impostorGame.ts en el
      // backend (índice aleatorio uniforme), duplicada intencionalmente por
      // ser trivial y no depender de red para cada pase de móvil.
      setImpostorIndex(Math.floor(Math.random() * playerCount));
      setRevealIndex(0);
      setCardShown(false);
      setVotes([]);
      setPhase('revealing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo obtener la palabra');
    }
  }

  function nextReveal() {
    if (revealIndex + 1 >= playerCount) {
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

  function castVote(playerIndex: number) {
    setVotes((v) => {
      const next = [...v, playerIndex];
      if (next.length >= playerCount) setPhase('result');
      return next;
    });
  }

  const tally = useMemo(() => {
    const counts = new Array(playerCount).fill(0);
    for (const v of votes) counts[v]++;
    return counts;
  }, [votes, playerCount]);

  const mostVotedIndex = tally.indexOf(Math.max(...tally));

  return (
    <div className="juego-shell">
      <div className="juego-shell-header">
        <Link to="/" className="juego-volver">← Volver</Link>
        <h1>🕵️ El Impostor</h1>
      </div>

      {phase === 'setup' && (
        <div className="juego-card-central">
          <label className="juego-texto-secundario">Número de jugadores</label>
          <input
            className="juego-input"
            type="number"
            min={3}
            max={20}
            value={playerCount}
            onChange={(e) => setPlayerCount(Math.max(3, Number(e.target.value) || 3))}
          />
          <label className="juego-texto-secundario">Categoría (opcional)</label>
          <select className="juego-input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {error && <p className="juego-error">{error}</p>}
          <button className="juego-boton" onClick={startRound}>Empezar ronda</button>
        </div>
      )}

      {phase === 'revealing' && (
        <div className="juego-card-central">
          <p className="juego-texto-secundario">Pasa el móvil al Jugador {revealIndex + 1}</p>
          {!cardShown ? (
            <button className="juego-boton" onClick={() => setCardShown(true)}>Toca para ver tu rol</button>
          ) : (
            <>
              {revealIndex === impostorIndex ? (
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
                {revealIndex + 1 >= playerCount ? 'Empezar debate' : 'Siguiente jugador'}
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
          <p className="juego-texto-secundario">Voto {votes.length + 1} de {playerCount} — ¿quién es el impostor?</p>
          <div className="juego-lista-jugadores">
            {Array.from({ length: playerCount }, (_, i) => (
              <button key={i} className="juego-boton-secundario" onClick={() => castVote(i)}>
                Jugador {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === 'result' && (
        <div className="juego-card-central">
          <h2>🎭 Revelación</h2>
          <p>El impostor era: <strong>Jugador {impostorIndex + 1}</strong></p>
          <p className="juego-texto-secundario">La palabra era: {word}</p>
          <p className="juego-texto-secundario">Más votado: Jugador {mostVotedIndex + 1}</p>
          <p>{mostVotedIndex === impostorIndex ? '✅ ¡Cazado!' : '❌ Escapó'}</p>
          <button className="juego-boton" onClick={() => setPhase('setup')}>Otra ronda</button>
        </div>
      )}
    </div>
  );
}
