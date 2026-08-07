import type { ImpostorRole, ImpostorRound } from '../games/impostorGame';
import type { TriviaQuestion } from '../content/loader';
import type { ShuffleBag } from '../services/shuffleBag';

export type GameType = 'impostor-live' | 'trivia-live';

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
  round: ImpostorRound | null;
  roleByPlayer: Map<string, ImpostorRole>;
  phase: 'lobby' | 'roles-revealed' | 'voting' | 'reveal';
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

export interface RoomState {
  code: string;
  gameType: GameType;
  hostId: string;
  players: Map<string, Player>;
  createdAt: number;
  lastActivity: number;
  impostor?: ImpostorLiveState;
  trivia?: TriviaLiveState;
}
