import { useCallback, useMemo, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// Shared "team turn" state machine for team-play, shared-device games
// (Tabú, Mímica) — ver design.md "Decisions — team play, shared device:
// Tabú and Mímica share one client-side 'team turn' module". Both games
// reuse: team setup (names, >=2 teams), a running turn timer, a
// "toca para revelar" gate before the card is shown, and a per-team
// accumulated scoreboard. Each game only supplies its own card-resolution
// buttons (Tabú: Acierto/¡Prohibida!, Mímica: Acierto/Pasar) on top of this.
// ─────────────────────────────────────────────────────────────────────────

export type TeamTurnPhase =
  | 'setup-teams'
  | 'setup-config'
  | 'turn-gate'
  | 'turn-active'
  | 'turn-result'
  | 'game-over';

export type EndMode = 'rounds' | 'score';

export interface TeamTurnConfig {
  /** Duración de cada turno, en segundos. */
  roundSeconds: number;
  /** Whether the game ends after a fixed number of rounds or on reaching a target score. */
  endMode: EndMode;
  /** Número de rondas completas (cada equipo juega un turno por ronda). Solo aplica si endMode === 'rounds'. */
  roundsCount: number;
  /** Puntuación objetivo. Solo aplica si endMode === 'score'. */
  targetScore: number;
}

export interface TeamEntry {
  id: string;
  name: string;
  score: number;
}

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface UseTeamTurnGameResult<T> {
  phase: TeamTurnPhase;
  teams: TeamEntry[];
  config: TeamTurnConfig;
  currentTeamIndex: number;
  currentTeam: TeamEntry | null;
  secondsLeft: number;
  currentCard: T | null;
  turnCorrectCount: number;
  roundsPlayed: number;
  setTeamNames: (names: string[]) => void;
  setConfig: (config: TeamTurnConfig) => void;
  setDeck: (deck: T[]) => void;
  startGame: () => void;
  revealAndStartTurn: () => void;
  markCorrect: () => void;
  discardCard: (scorePenalty?: number) => void;
  nextTeam: () => void;
  playAgain: () => void;
}

const MIN_TEAMS = 2;

export function useTeamTurnGame<T>(): UseTeamTurnGameResult<T> {
  const [phase, setPhase] = useState<TeamTurnPhase>('setup-teams');
  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [config, setConfigState] = useState<TeamTurnConfig>({
    roundSeconds: 60,
    endMode: 'rounds',
    roundsCount: 3,
    targetScore: 30,
  });
  const [currentTeamIndex, setCurrentTeamIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [currentCard, setCurrentCard] = useState<T | null>(null);
  const [turnCorrectCount, setTurnCorrectCount] = useState(0);
  const [roundsPlayed, setRoundsPlayed] = useState(0);

  const deckRef = useRef<T[]>([]);
  const originalDeckRef = useRef<T[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const drawCard = useCallback((): T | null => {
    if (deckRef.current.length === 0) {
      if (originalDeckRef.current.length === 0) return null;
      deckRef.current = shuffle(originalDeckRef.current);
    }
    return deckRef.current.pop() ?? null;
  }, []);

  function setTeamNames(names: string[]) {
    setTeams(
      names
        .map((name, i) => ({ id: `team${i}`, name: name.trim() || `Equipo ${i + 1}`, score: 0 }))
        .filter((_, i) => i < names.length),
    );
  }

  function setConfig(next: TeamTurnConfig) {
    setConfigState(next);
  }

  /** Guarda el mazo (ya obtenido del backend) y pasa a la pantalla de
   * configuración de ronda. Separado de `startGame` porque la carga del
   * mazo es asíncrona (fetch) y vive en el componente de cada juego. */
  function setDeck(deck: T[]) {
    originalDeckRef.current = deck;
    deckRef.current = shuffle(deck);
    setPhase('setup-config');
  }

  function startGame() {
    deckRef.current = shuffle(originalDeckRef.current);
    setCurrentTeamIndex(0);
    setRoundsPlayed(0);
    setTeams((prev) => prev.map((t) => ({ ...t, score: 0 })));
    setPhase('turn-gate');
  }

  function revealAndStartTurn() {
    stopTimer();
    setTurnCorrectCount(0);
    setSecondsLeft(config.roundSeconds);
    setCurrentCard(drawCard());
    setPhase('turn-active');

    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          stopTimer();
          setPhase('turn-result');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  function applyScoreDelta(delta: number) {
    setTeams((prev) =>
      prev.map((t, i) => (i === currentTeamIndex ? { ...t, score: Math.max(0, t.score + delta) } : t)),
    );
  }

  function markCorrect() {
    applyScoreDelta(1);
    setTurnCorrectCount((c) => c + 1);
    setCurrentCard(drawCard());
  }

  function discardCard(scorePenalty = 0) {
    if (scorePenalty > 0) applyScoreDelta(-scorePenalty);
    setCurrentCard(drawCard());
  }

  function nextTeam() {
    const nextIndex = (currentTeamIndex + 1) % teams.length;
    const finishedFullRound = nextIndex === 0;
    const newRoundsPlayed = finishedFullRound ? roundsPlayed + 1 : roundsPlayed;
    if (finishedFullRound) setRoundsPlayed(newRoundsPlayed);

    const reachedTargetScore = config.endMode === 'score' && teams.some((t) => t.score >= config.targetScore);
    const reachedRoundsCount =
      config.endMode === 'rounds' && finishedFullRound && newRoundsPlayed >= config.roundsCount;

    if (reachedTargetScore || reachedRoundsCount) {
      setPhase('game-over');
      return;
    }

    setCurrentTeamIndex(nextIndex);
    setPhase('turn-gate');
  }

  function playAgain() {
    stopTimer();
    setTeams((prev) => prev.map((t) => ({ ...t, score: 0 })));
    setCurrentTeamIndex(0);
    setRoundsPlayed(0);
    setCurrentCard(null);
    setPhase('setup-teams');
  }

  const currentTeam = useMemo(() => teams[currentTeamIndex] ?? null, [teams, currentTeamIndex]);

  return {
    phase,
    teams,
    config,
    currentTeamIndex,
    currentTeam,
    secondsLeft,
    currentCard,
    turnCorrectCount,
    roundsPlayed,
    setTeamNames,
    setConfig,
    setDeck,
    startGame,
    revealAndStartTurn,
    markCorrect,
    discardCard,
    nextTeam,
    playAgain,
  };
}

export const MIN_TEAM_COUNT = MIN_TEAMS;
