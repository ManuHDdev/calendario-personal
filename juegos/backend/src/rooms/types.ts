import type { ImpostorGameState } from '../games/impostorGame';
import type { TriviaQuestion } from '../content/loader';
import type { ShuffleBag } from '../services/shuffleBag';

export type GameType = 'impostor-live' | 'trivia-live' | 'hombre-lobo-live';

/**
 * Socket abstraction mínima: roomStore.ts no depende de @fastify/websocket ni
 * de 'ws' directamente, para poder testear la lógica de sala sin abrir
 * sockets reales. ws.route.ts adapta el WebSocket real a esta forma.
 */
export interface RoomSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface Player {
  id: string; // sub del JWT de Keycloak
  username: string;
  isHost: boolean;
  connected: boolean;
  socket: RoomSocket | null;
  /** Timestamp de desconexión, usado para el período de gracia de ~60s (spec.md "Reconnection grace period"). */
  disconnectedAt: number | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

export interface ImpostorLiveState {
  bag: ShuffleBag<{ palabra: string; categoria: string }>;
  game: ImpostorGameState | null;
  phase: 'lobby' | 'roles-revealed' | 'voting' | 'discussion' | 'reveal';
}

export interface TriviaAnswer {
  answer: string;
  atMs: number;
}

export interface TriviaLiveState {
  bag: ShuffleBag<TriviaQuestion>;
  currentQuestion: TriviaQuestion | null;
  questionStartedAt: number | null;
  timerMs: number;
  answers: Map<string, TriviaAnswer>;
  scores: Map<string, number>;
  questionsAsked: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Hombre Lobo en vivo — ver design.md "Hombre Lobo (`gameType:
// 'hombre-lobo-live'`)" y games/hombreLoboLive.ts. La app hace de narradora:
// máquina de fases explícita, prompts privados por rol vía `toPlayer`
// (mismo mecanismo que ImpostorLiveState usa para ocultar la palabra al
// impostor), interrupción de venganza del Cazador y comprobación de
// condición de victoria tras cada eliminación.
// ─────────────────────────────────────────────────────────────────────────

export type LoboRole = 'lobo' | 'aldeano' | 'vidente' | 'bruja' | 'cazador';

export type HombreLoboPhase =
  | 'lobby'
  | 'noche-lobos'
  | 'noche-vidente'
  | 'noche-bruja'
  | 'resolucion-noche'
  | 'dia-debate'
  | 'dia-votacion'
  | 'resolucion-dia'
  | 'fin';

export interface HombreLoboDeathLogEntry {
  playerId: string;
  round: number;
  when: 'noche' | 'dia';
  /** Las muertes nocturnas nunca revelan el rol — solo las expulsiones de día (y la venganza del Cazador si ocurre de día). */
  role: LoboRole | null;
}

export interface HombreLoboPendingRevenge {
  cazadorId: string;
  /** Fase a la que continuar una vez resuelta la venganza. */
  resumePhase: HombreLoboPhase;
  /** Contexto de la muerte que la disparó — determina si el rol del objetivo se revela. */
  context: 'noche' | 'dia';
}

export interface HombreLoboConfig {
  /** Ratio configurable de jugadores por lobo (design.md "~1 lobo por 3-4 jugadores"). */
  playersPerLobo: number;
  debateMs: number;
  tieBehavior: 'no-expulsion' | 'revote';
}

export interface HombreLoboState {
  roles: Map<string, LoboRole>;
  alive: Set<string>;
  phase: HombreLoboPhase;
  round: number;
  config: HombreLoboConfig;
  loboVotes: Map<string, string>;
  lobosTarget: string | null;
  /** Pociones de la Bruja: una vez por partida, no una vez por noche. */
  brujaHealUsed: boolean;
  brujaKillUsed: boolean;
  brujaHealTarget: string | null;
  brujaKillTarget: string | null;
  dayVotes: Map<string, string>;
  pendingRevenge: HombreLoboPendingRevenge | null;
  deathLog: HombreLoboDeathLogEntry[];
  winner: 'lobos' | 'aldeanos' | null;
}

export interface RoomState {
  code: string;
  gameType: GameType;
  hostId: string;
  players: Map<string, Player>;
  createdAt: number;
  lastActivity: number;
  impostor?: ImpostorLiveState;
  trivia?: TriviaLiveState;
  hombreLobo?: HombreLoboState;
}
