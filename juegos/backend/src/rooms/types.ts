import type { ImpostorGameState } from '../games/impostorGame';
import type { TriviaQuestion, RespuestaFalsaPregunta } from '../content/loader';
import type { ShuffleBag } from '../services/shuffleBag';

export type GameType = 'impostor-live' | 'trivia-live' | 'respuestas-falsas-live' | 'stop-live';

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

/**
 * Una opción de voto de Respuestas falsas — ver specs/juegos/spec.md
 * "Respuestas falsas scoring". `authorId` es `null` para la respuesta real
 * (nunca es autoría de un jugador) y solo se usa server-side para rechazar
 * el auto-voto y para el reveal; jamás se envía al cliente antes del reveal.
 */
export interface RespuestasFalsasOption {
  id: string;
  text: string;
  authorId: string | null;
}

export interface RespuestasFalsasLiveState {
  bag: ShuffleBag<RespuestaFalsaPregunta>;
  phase: 'lobby' | 'submitting' | 'voting' | 'reveal';
  currentQuestion: RespuestaFalsaPregunta | null;
  /** playerId -> texto de la respuesta falsa enviada por ese jugador. */
  submissions: Map<string, string>;
  /** Construido al abrir la votación (barajado, ids opacos); null fuera de esa fase. */
  options: RespuestasFalsasOption[] | null;
  /** playerId -> id de la opción votada. */
  votes: Map<string, string>;
  scores: Map<string, number>;
  questionsAsked: number;
}

/** Categorías por defecto de Stop / Basta — ver design.md "Stop / Basta". */
export const STOP_DEFAULT_CATEGORIES = [
  'Nombre',
  'Animal',
  'Fruta',
  'País',
  'Color',
  'Objeto',
  'Profesión',
] as const;

/** Letras excluidas por defecto por ser difíciles — configurable per room. */
export const STOP_DEFAULT_EXCLUDED_LETTERS = ['Ñ', 'X', 'W'];

export interface StopLiveState {
  categories: string[];
  excludedLetters: string[];
  phase: 'lobby' | 'active' | 'stopped';
  letter: string | null;
  /** playerId -> (categoria -> valor enviado). Envíos parciales/incrementales permitidos. */
  submissions: Map<string, Record<string, string>>;
  stoppedBy: string | null;
  /** Puntuación acumulada a lo largo de las rondas jugadas en la sala. */
  scores: Map<string, number>;
  roundsPlayed: number;
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
  respuestasFalsas?: RespuestasFalsasLiveState;
  stop?: StopLiveState;
}
