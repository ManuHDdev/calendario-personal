import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBombPartyTerm, newSessionId } from '../../services/api';
import '../shared.css';

// Bomb Party (ver design.md "Decisions — pass-and-play games: Bomb Party" y
// specs/juegos/spec.md "Bomb Party elimination loop"). El cronómetro de la
// bomba es genuinamente oculto: se calcula como `now + random(min, max)` al
// empezar la ronda y NUNCA se renderiza — solo un "pásalo" genérico. Sigue
// corriendo aunque el turno pase de jugador en jugador dentro de la misma
// ronda; solo se reinicia (nueva sílaba/categoría + nuevo temporizador) tras
// una explosión.

type Phase = 'setup-count' | 'setup-names' | 'setup-config' | 'playing' | 'explosion' | 'final';
type Modo = 'silaba' | 'categoria';

const MIN_PLAYERS = 2;
const DEFAULT_LIVES = 3;
const DEFAULT_MIN_SECONDS = 15;
const DEFAULT_MAX_SECONDS = 45;

interface PlayerEntry {
  id: string;
  name: string;
  lives: number;
}

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function BombParty() {
  const sessionId = useMemo(() => newSessionId(), []);
  const [phase, setPhase] = useState<Phase>('setup-count');
  const [playerCount, setPlayerCount] = useState(MIN_PLAYERS + 1);
  const [players, setPlayers] = useState<PlayerEntry[]>([]);
  const [modo, setModo] = useState<Modo>('silaba');
  const [startingLives, setStartingLives] = useState(DEFAULT_LIVES);
  const [minSeconds, setMinSeconds] = useState(DEFAULT_MIN_SECONDS);
  const [maxSeconds, setMaxSeconds] = useState(DEFAULT_MAX_SECONDS);
  const [term, setTerm] = useState('');
  const [holderId, setHolderId] = useState<string | null>(null);
  const [lastExplodedId, setLastExplodedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Refs para que el timeout oculto siempre lea el estado más reciente sin
  // reprogramarse en cada render (el cronómetro no se resetea al pasar turno).
  const playersRef = useRef<PlayerEntry[]>([]);
  const holderRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);
  useEffect(() => {
    holderRef.current = holderId;
  }, [holderId]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  function confirmPlayerCount() {
    setPlayers(
      Array.from({ length: playerCount }, (_, i) => ({ id: `p${i}`, name: `Jugador ${i + 1}`, lives: startingLives })),
    );
    setPhase('setup-names');
  }

  function updateName(id: string, name: string) {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }

  function confirmNames() {
    setPhase('setup-config');
  }

  function alivePlayers(list: PlayerEntry[]): PlayerEntry[] {
    return list.filter((p) => p.lives > 0);
  }

  function armHiddenTimer() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const seconds = minSeconds + Math.random() * Math.max(0, maxSeconds - minSeconds);
    timeoutRef.current = setTimeout(handleExplosion, seconds * 1000);
  }

  async function startRound(list: PlayerEntry[]) {
    setError('');
    try {
      const res = await getBombPartyTerm(sessionId, modo);
      setTerm(res.texto);
      const alive = alivePlayers(list);
      const nextHolder = shuffle(alive)[0]?.id ?? null;
      setHolderId(nextHolder);
      setPhase('playing');
      armHiddenTimer();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la sílaba/categoría');
    }
  }

  async function startGame() {
    const withLives = players.map((p) => ({ ...p, lives: startingLives }));
    setPlayers(withLives);
    await startRound(withLives);
  }

  function passTurn() {
    const alive = alivePlayers(playersRef.current);
    if (alive.length === 0) return;
    const currentIndex = alive.findIndex((p) => p.id === holderRef.current);
    const next = alive[(currentIndex + 1) % alive.length];
    setHolderId(next.id);
    // El temporizador NO se reinicia al pasar turno — sigue corriendo desde
    // el inicio de la ronda (ver spec.md).
  }

  function handleExplosion() {
    const current = playersRef.current;
    const holder = holderRef.current;
    if (!holder) return;
    const next = current.map((p) => (p.id === holder ? { ...p, lives: Math.max(0, p.lives - 1) } : p));
    setPlayers(next);
    setLastExplodedId(holder);
    setPhase('explosion');

    const stillAlive = alivePlayers(next);
    if (stillAlive.length <= 1) {
      setPhase('final');
    }
  }

  function continueAfterExplosion() {
    const stillAlive = alivePlayers(playersRef.current);
    if (stillAlive.length <= 1) {
      setPhase('final');
      return;
    }
    startRound(playersRef.current);
  }

  function nameOf(id: string | null): string {
    return players.find((p) => p.id === id)?.name ?? '';
  }

  const alive = alivePlayers(players);
  const winner = phase === 'final' ? alive[0] ?? null : null;

  return (
    <div className="juego-shell">
      <div className="juego-shell-header">
        <Link to="/" className="juego-volver">← Volver</Link>
        <h1>💣 Bomb Party</h1>
      </div>

      {phase === 'setup-count' && (
        <div className="juego-card-central">
          <label className="juego-texto-secundario">Número de jugadores (mínimo {MIN_PLAYERS + 1})</label>
          <input
            className="juego-input"
            type="number"
            min={MIN_PLAYERS + 1}
            max={20}
            value={playerCount}
            onChange={(e) => setPlayerCount(Math.max(MIN_PLAYERS + 1, Number(e.target.value) || MIN_PLAYERS + 1))}
          />
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
          <button className="juego-boton" onClick={confirmNames}>Siguiente: configuración</button>
        </div>
      )}

      {phase === 'setup-config' && (
        <div className="juego-card-central">
          <h2>Configuración</h2>
          <label className="juego-texto-secundario">Modo</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={modo === 'silaba' ? 'juego-boton' : 'juego-boton-secundario'}
              onClick={() => setModo('silaba')}
            >
              Sílaba
            </button>
            <button
              className={modo === 'categoria' ? 'juego-boton' : 'juego-boton-secundario'}
              onClick={() => setModo('categoria')}
            >
              Categoría
            </button>
          </div>

          <label className="juego-texto-secundario">Vidas iniciales</label>
          <input
            className="juego-input"
            type="number"
            min={1}
            max={9}
            value={startingLives}
            onChange={(e) => setStartingLives(Math.max(1, Number(e.target.value) || DEFAULT_LIVES))}
          />

          <label className="juego-texto-secundario">Rango del temporizador oculto (segundos)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="juego-input"
              type="number"
              min={5}
              max={maxSeconds}
              value={minSeconds}
              onChange={(e) => setMinSeconds(Math.min(maxSeconds, Math.max(5, Number(e.target.value) || DEFAULT_MIN_SECONDS)))}
            />
            <span className="juego-texto-secundario">a</span>
            <input
              className="juego-input"
              type="number"
              min={minSeconds}
              max={180}
              value={maxSeconds}
              onChange={(e) => setMaxSeconds(Math.max(minSeconds, Number(e.target.value) || DEFAULT_MAX_SECONDS))}
            />
          </div>
          <p className="juego-texto-secundario">El tiempo real nunca se muestra durante la partida.</p>

          {error && <p className="juego-error">{error}</p>}
          <button className="juego-boton" onClick={startGame}>Empezar partida</button>
        </div>
      )}

      {phase === 'playing' && (
        <div className="juego-card-central">
          <p className="juego-texto-secundario">Le toca a:</p>
          <h2>{nameOf(holderId)}</h2>
          <p className="juego-texto-secundario">{modo === 'silaba' ? 'Sílaba' : 'Categoría'}:</p>
          <h1 style={{ fontSize: 32 }}>{term}</h1>
          <p className="juego-texto-secundario">
            Di una palabra válida en voz alta y pasa el móvil. Nadie sabe cuándo explotará.
          </p>
          <button className="juego-boton" onClick={passTurn}>Pasar el turno</button>
          <div className="juego-lista-jugadores">
            {players.map((p) => (
              <p key={p.id} className="juego-texto-secundario">
                {p.name}: {p.lives > 0 ? '❤️'.repeat(p.lives) : '☠️ eliminado/a'}
              </p>
            ))}
          </div>
        </div>
      )}

      {phase === 'explosion' && (
        <div className="juego-card-central">
          <h2>💥 ¡Explosión!</h2>
          <p>
            <strong>{nameOf(lastExplodedId)}</strong> pierde una vida.
          </p>
          <div className="juego-lista-jugadores">
            {players.map((p) => (
              <p key={p.id} className="juego-texto-secundario">
                {p.name}: {p.lives > 0 ? '❤️'.repeat(p.lives) : '☠️ eliminado/a'}
              </p>
            ))}
          </div>
          {error && <p className="juego-error">{error}</p>}
          <button className="juego-boton" onClick={continueAfterExplosion}>Continuar</button>
        </div>
      )}

      {phase === 'final' && (
        <div className="juego-card-central">
          <h2>🏆 ¡Tenemos ganador/a!</h2>
          <h1>{winner?.name}</h1>
          <button className="juego-boton" onClick={() => setPhase('setup-count')}>Otra partida</button>
        </div>
      )}
    </div>
  );
}
