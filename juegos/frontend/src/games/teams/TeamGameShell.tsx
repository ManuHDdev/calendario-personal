import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { TeamTurnConfig, UseTeamTurnGameResult, MIN_TEAM_COUNT } from './useTeamTurnGame';
import '../shared.css';
import './teams.css';

// ─────────────────────────────────────────────────────────────────────────
// Shared UI shell for team-play, shared-device games (Tabú, Mímica) — ver
// design.md "Decisions — team play, shared device". Renders team setup,
// round config, the turn-gate ("toca para revelar"), the running timer, and
// the per-team scoreboard; each game supplies only its card content and its
// own card-resolution buttons via render props.
// ─────────────────────────────────────────────────────────────────────────

interface TeamGameShellProps<T> {
  icon: string;
  title: string;
  categories: string[];
  defaultRoundSeconds: number;
  loading: boolean;
  error: string;
  onLoadDeck: (categoria?: string) => Promise<void>;
  game: UseTeamTurnGameResult<T>;
  renderCard: (card: T) => ReactNode;
  renderActions: () => ReactNode;
  renderRulesOverlay?: () => ReactNode;
  renderExtraSetup?: () => ReactNode;
}

export default function TeamGameShell<T>({
  icon,
  title,
  categories,
  defaultRoundSeconds,
  loading,
  error,
  onLoadDeck,
  game,
  renderCard,
  renderActions,
  renderRulesOverlay,
  renderExtraSetup,
}: TeamGameShellProps<T>) {
  const [teamCount, setTeamCount] = useState(2);
  const [names, setNames] = useState<string[]>(['Equipo 1', 'Equipo 2']);
  const [categoria, setCategoria] = useState('');
  const [endMode, setEndMode] = useState<TeamTurnConfig['endMode']>('rounds');
  const [roundsCount, setRoundsCount] = useState(3);
  const [targetScore, setTargetScore] = useState(30);
  const [roundSeconds, setRoundSeconds] = useState(defaultRoundSeconds);
  const [showRules, setShowRules] = useState(false);

  function updateTeamCount(count: number) {
    const clamped = Math.max(MIN_TEAM_COUNT, count);
    setTeamCount(clamped);
    setNames((prev) => {
      const next = prev.slice(0, clamped);
      while (next.length < clamped) next.push(`Equipo ${next.length + 1}`);
      return next;
    });
  }

  function updateName(i: number, name: string) {
    setNames((prev) => prev.map((n, idx) => (idx === i ? name : n)));
  }

  async function confirmTeams() {
    game.setTeamNames(names);
    await onLoadDeck(categoria || undefined);
  }

  function confirmConfigAndStart() {
    game.setConfig({ roundSeconds, endMode, roundsCount, targetScore });
    game.startGame();
  }

  return (
    <div className="juego-shell">
      <div className="juego-shell-header">
        <Link to="/" className="juego-volver">← Volver</Link>
        <h1>{icon} {title}</h1>
      </div>

      {game.phase === 'setup-teams' && (
        <div className="juego-card-central">
          <h2>Equipos</h2>
          <label className="juego-texto-secundario">Número de equipos (mínimo {MIN_TEAM_COUNT})</label>
          <input
            className="juego-input"
            type="number"
            min={MIN_TEAM_COUNT}
            max={8}
            value={teamCount}
            onChange={(e) => updateTeamCount(Number(e.target.value) || MIN_TEAM_COUNT)}
          />
          <div className="juego-lista-jugadores">
            {names.map((name, i) => (
              <input
                key={i}
                className="juego-input"
                value={name}
                onChange={(e) => updateName(i, e.target.value)}
              />
            ))}
          </div>
          {categories.length > 0 && (
            <>
              <label className="juego-texto-secundario">Categoría (opcional)</label>
              <select className="juego-input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="">Todas</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </>
          )}
          {error && <p className="juego-error">{error}</p>}
          <button className="juego-boton" onClick={confirmTeams} disabled={loading}>
            {loading ? 'Cargando...' : 'Siguiente: configuración'}
          </button>
        </div>
      )}

      {game.phase === 'setup-config' && (
        <div className="juego-card-central">
          <h2>Configuración</h2>
          <label className="juego-texto-secundario">Duración del turno (segundos)</label>
          <input
            className="juego-input"
            type="number"
            min={15}
            max={180}
            value={roundSeconds}
            onChange={(e) => setRoundSeconds(Number(e.target.value) || defaultRoundSeconds)}
          />
          <label className="juego-texto-secundario">Condición de fin de partida</label>
          <select
            className="juego-input"
            value={endMode}
            onChange={(e) => setEndMode(e.target.value as TeamTurnConfig['endMode'])}
          >
            <option value="rounds">Número de rondas</option>
            <option value="score">Puntuación objetivo</option>
          </select>
          {endMode === 'rounds' ? (
            <>
              <label className="juego-texto-secundario">Rondas (cada equipo juega una vez por ronda)</label>
              <input
                className="juego-input"
                type="number"
                min={1}
                max={20}
                value={roundsCount}
                onChange={(e) => setRoundsCount(Number(e.target.value) || 1)}
              />
            </>
          ) : (
            <>
              <label className="juego-texto-secundario">Puntuación objetivo</label>
              <input
                className="juego-input"
                type="number"
                min={5}
                max={200}
                value={targetScore}
                onChange={(e) => setTargetScore(Number(e.target.value) || 5)}
              />
            </>
          )}
          {renderExtraSetup?.()}
          <button className="juego-boton" onClick={confirmConfigAndStart}>Empezar partida</button>
        </div>
      )}

      {(game.phase === 'turn-gate' || game.phase === 'turn-active') && (
        <div className="juego-card-central" style={{ position: 'relative' }}>
          <TeamScoreboard game={game} compact />
          {game.phase === 'turn-gate' && (
            <>
              <p className="juego-texto-secundario">Pasa el móvil al equipo <strong>{game.currentTeam?.name}</strong></p>
              <button className="juego-boton" onClick={game.revealAndStartTurn}>Toca para revelar</button>
            </>
          )}
          {game.phase === 'turn-active' && game.currentCard && (
            <>
              <div className="team-turn-timer">{game.secondsLeft}s</div>
              <p className="juego-texto-secundario">Aciertos este turno: {game.turnCorrectCount}</p>
              <div className="team-turn-card">{renderCard(game.currentCard)}</div>
              {renderActions()}
              {renderRulesOverlay && (
                <button className="juego-boton-secundario team-turn-help" onClick={() => setShowRules(true)}>
                  ?
                </button>
              )}
            </>
          )}
          {game.phase === 'turn-active' && !game.currentCard && (
            <p className="juego-texto-secundario">Se han agotado las cartas de esta categoría.</p>
          )}
        </div>
      )}

      {game.phase === 'turn-result' && (
        <div className="juego-card-central">
          <h2>⏱️ Tiempo</h2>
          <p>
            <strong>{game.currentTeam?.name}</strong> acertó {game.turnCorrectCount} carta(s) este turno
          </p>
          <TeamScoreboard game={game} />
          <button className="juego-boton" onClick={game.nextTeam}>Siguiente equipo</button>
        </div>
      )}

      {game.phase === 'game-over' && (
        <div className="juego-card-central">
          <h2>🏆 Fin de la partida</h2>
          <TeamScoreboard game={game} />
          <button className="juego-boton" onClick={game.playAgain}>Otra partida</button>
        </div>
      )}

      {showRules && renderRulesOverlay && (
        <div className="team-turn-rules-overlay" onClick={() => setShowRules(false)}>
          <div className="team-turn-rules-card" onClick={(e) => e.stopPropagation()}>
            {renderRulesOverlay()}
            <button className="juego-boton" onClick={() => setShowRules(false)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TeamScoreboard<T>({ game, compact = false }: { game: UseTeamTurnGameResult<T>; compact?: boolean }) {
  const sorted = compact ? game.teams : [...game.teams].sort((a, b) => b.score - a.score);
  return (
    <div className="team-scoreboard">
      {sorted.map((t) => (
        <div
          key={t.id}
          className={`team-scoreboard-row${t.id === game.currentTeam?.id ? ' team-scoreboard-row-active' : ''}`}
        >
          <span>{t.name}</span>
          <span>{t.score}</span>
        </div>
      ))}
    </div>
  );
}
