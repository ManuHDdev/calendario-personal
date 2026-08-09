import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getQuienEsMasProbablePrompt, newSessionId } from '../../services/api';
import '../shared.css';

// ¿Quién es más probable que...? (ver design.md "Decisions — pass-and-play
// games" y specs/juegos/spec.md "¿Quién es más probable que...? tally and
// running scoreboard"). Registro de nombres reutiliza la misma UX de setup
// que El Impostor (PassAndPlayImpostor.tsx); no hay condición de victoria —
// solo un contador acumulado de "veces señalado" por jugador durante toda
// la sesión, con un resumen final opcional.

type Phase = 'setup-count' | 'setup-names' | 'setup-dureza' | 'prompt' | 'tally' | 'result' | 'summary';

const DUREZAS: { value: string; label: string }[] = [
  { value: 'familiar', label: '👨‍👩‍👧 Familiar' },
  { value: 'fiesta', label: '🎉 Fiesta' },
  { value: 'subido_de_tono', label: '🔥 Subido de tono' },
  { value: 'mezcla', label: '🎲 Mezcla' },
];

const MIN_PLAYERS = 3;

interface PlayerEntry {
  id: string;
  name: string;
  vecesSenalado: number;
}

export default function QuienEsMasProbable() {
  const sessionId = useMemo(() => newSessionId(), []);
  const [phase, setPhase] = useState<Phase>('setup-count');
  const [playerCount, setPlayerCount] = useState(MIN_PLAYERS);
  const [players, setPlayers] = useState<PlayerEntry[]>([]);
  const [dureza, setDureza] = useState('mezcla');
  const [prompt, setPrompt] = useState('');
  const [tally, setTally] = useState<Record<string, number>>({});
  const [mostTappedIds, setMostTappedIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  function confirmPlayerCount() {
    setPlayers(
      Array.from({ length: playerCount }, (_, i) => ({ id: `p${i}`, name: `Jugador ${i + 1}`, vecesSenalado: 0 })),
    );
    setPhase('setup-names');
  }

  function updateName(id: string, name: string) {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }

  async function drawPrompt() {
    setError('');
    try {
      const res = await getQuienEsMasProbablePrompt(sessionId, dureza === 'mezcla' ? undefined : dureza);
      setPrompt(res.prompt);
      setTally({});
      setPhase('prompt');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el prompt');
    }
  }

  async function startGame() {
    setPhase('setup-dureza');
  }

  async function confirmDurezaAndStart() {
    await drawPrompt();
  }

  function tap(playerId: string) {
    setTally((prev) => ({ ...prev, [playerId]: (prev[playerId] ?? 0) + 1 }));
  }

  function revealResult() {
    let max = 0;
    for (const count of Object.values(tally)) if (count > max) max = count;
    const top = max === 0 ? [] : Object.entries(tally).filter(([, c]) => c === max).map(([id]) => id);
    setMostTappedIds(top);
    if (top.length > 0) {
      setPlayers((prev) => prev.map((p) => (top.includes(p.id) ? { ...p, vecesSenalado: p.vecesSenalado + 1 } : p)));
    }
    setPhase('result');
  }

  function nameOf(id: string): string {
    return players.find((p) => p.id === id)?.name ?? id;
  }

  const topScoreboard = [...players].sort((a, b) => b.vecesSenalado - a.vecesSenalado);

  return (
    <div className="juego-shell">
      <div className="juego-shell-header">
        <Link to="/" className="juego-volver">← Volver</Link>
        <h1>🙋 ¿Quién es más probable que...?</h1>
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
          <button className="juego-boton" onClick={startGame}>Siguiente: dureza</button>
        </div>
      )}

      {phase === 'setup-dureza' && (
        <div className="juego-card-central">
          <label className="juego-texto-secundario">Elige el tono</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {DUREZAS.map((d) => (
              <button
                key={d.value}
                className={d.value === dureza ? 'juego-boton' : 'juego-boton-secundario'}
                onClick={() => setDureza(d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>
          {error && <p className="juego-error">{error}</p>}
          <button className="juego-boton" onClick={confirmDurezaAndStart}>Empezar</button>
        </div>
      )}

      {phase === 'prompt' && (
        <div className="juego-card-central">
          <h2>{prompt}</h2>
          <p className="juego-texto-secundario">Señalad con la mano al jugador que creáis que encaja más</p>
          <button className="juego-boton" onClick={() => setPhase('tally')}>Contar votos</button>
        </div>
      )}

      {phase === 'tally' && (
        <div className="juego-card-central">
          <h2>Recuento</h2>
          <p className="juego-texto-secundario">Toca una vez por cada mano levantada por ese jugador</p>
          <div className="juego-lista-jugadores">
            {players.map((p) => (
              <button key={p.id} className="juego-boton-secundario" onClick={() => tap(p.id)}>
                {p.name}: {tally[p.id] ?? 0}
              </button>
            ))}
          </div>
          <button className="juego-boton" onClick={revealResult}>Ver resultado</button>
        </div>
      )}

      {phase === 'result' && (
        <div className="juego-card-central">
          <h2>Resultado</h2>
          {mostTappedIds.length === 0 && <p>Nadie ha sido señalado esta ronda</p>}
          {mostTappedIds.length === 1 && (
            <p><strong>{nameOf(mostTappedIds[0])}</strong> es el/la más señalado/a</p>
          )}
          {mostTappedIds.length > 1 && (
            <p>Empate entre: <strong>{mostTappedIds.map(nameOf).join(', ')}</strong></p>
          )}
          {error && <p className="juego-error">{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="juego-boton" onClick={drawPrompt}>Siguiente ronda</button>
            <button className="juego-boton-secundario" onClick={() => setPhase('summary')}>Terminar partida</button>
          </div>
        </div>
      )}

      {phase === 'summary' && (
        <div className="juego-card-central">
          <h2>📋 Resumen de la sesión</h2>
          {topScoreboard[0] && topScoreboard[0].vecesSenalado > 0 && (
            <p>
              🏆 Más señalado/a: <strong>{topScoreboard[0].name}</strong> ({topScoreboard[0].vecesSenalado} veces)
            </p>
          )}
          <div className="juego-lista-jugadores">
            {topScoreboard.map((p) => (
              <p key={p.id} className="juego-texto-secundario">{p.name}: {p.vecesSenalado} veces señalado/a</p>
            ))}
          </div>
          <button className="juego-boton" onClick={() => setPhase('setup-count')}>Nueva partida</button>
        </div>
      )}
    </div>
  );
}
