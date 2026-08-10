import type { ImpostorGameState } from '../games/impostorGame';
import type { TriviaQuestion, RespuestaFalsaPregunta } from '../content/loader';
import type { ShuffleBag } from '../services/shuffleBag';

export type GameType =
  | 'impostor-live'
  | 'trivia-live'
  | 'respuestas-falsas-live'
  | 'stop-live'
  | 'coup-live';

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

// ─────────────────────────────────────────────────────────────────────────
// Coup en vivo — ver design.md "Decisions — multi-device rooms" → "Coup" y
// spec.md "Coup action/challenge/block resolution". Estado autoritativo en
// el servidor: 5 personajes (Duque, Asesino, Capitán, Embajador, Condesa),
// 3 copias cada uno (15 cartas), 2 repartidas boca abajo a cada jugador al
// empezar. `pendingAction` es el único lugar donde vive la ventana de
// respuesta (pasar/desafiar/bloquear) a una acción o a un bloqueo — ver
// coupLive.ts para la máquina de resolución completa.
// ─────────────────────────────────────────────────────────────────────────

export type CoupCharacter = 'duque' | 'asesino' | 'capitan' | 'embajador' | 'condesa';

export type CoupActionType =
  | 'ingresos'
  | 'ayuda-externa'
  | 'golpe-estado'
  | 'duque'
  | 'asesino'
  | 'capitan'
  | 'embajador';

export interface CoupPlayerState {
  coins: number;
  /** Cartas de influencia boca abajo que el jugador aún conserva — solo se entregan a ese jugador (Delivery.toPlayer / whisper). */
  influence: CoupCharacter[];
  /** Cartas perdidas/reveladas boca arriba — información pública. */
  revealed: CoupCharacter[];
}

export interface CoupPendingAction {
  type: CoupActionType;
  actorId: string;
  targetId: string | null;
  /** Personaje reclamado por el actor; null para las acciones incondicionales (ingresos/ayuda-externa/golpe-estado). */
  claimedCharacter: CoupCharacter | null;
  /** 'action' = ventana de respuesta a la acción declarada; 'block' = ventana de respuesta a un bloqueo declarado sobre esa acción. */
  stage: 'action' | 'block';
  blockerId: string | null;
  blockClaim: CoupCharacter | null;
  /** Ids que ya han pasado explícitamente en la etapa actual — se reinicia al pasar de 'action' a 'block'. */
  passedIds: string[];
}

export interface CoupPendingExchange {
  playerId: string;
  /** Las cartas entre las que el jugador debe elegir cuáles conservar (sus originales + 2 robadas del mazo). */
  options: CoupCharacter[];
  /** Cuántas debe conservar — igual a su número de influencias antes de robar. */
  keepCount: number;
}

export interface CoupState {
  phase: 'lobby' | 'in-progress' | 'ended';
  /** Orden de turno fijado al empezar la partida (incluye jugadores eliminados, ver `eliminated`). */
  players: string[];
  playerState: Map<string, CoupPlayerState>;
  eliminated: Set<string>;
  deck: CoupCharacter[];
  turnIndex: number;
  pendingAction: CoupPendingAction | null;
  pendingExchange: CoupPendingExchange | null;
  winnerId: string | null;
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
  coup?: CoupState;
}
