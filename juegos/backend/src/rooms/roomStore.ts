import { createShuffleBag } from '../services/shuffleBag';
import { contentBanks } from '../content/loader';
import { createLobbyState as createHombreLoboLobbyState } from '../games/hombreLoboLive';
import type { GameType, Player, RoomSocket, RoomState } from './types';

// ─────────────────────────────────────────────────────────────────────────
// Map<roomCode, RoomState> en memoria del proceso — ver design.md "No
// database: content is static JSON, room state is memory-only". Sin Redis,
// sin persistencia: un reinicio del backend destruye las salas activas
// (riesgo aceptado explícitamente en design.md).
// ─────────────────────────────────────────────────────────────────────────

export const RECONNECT_GRACE_MS = 60_000; // ~60s, ver spec.md "Reconnection grace period"
export const ROOM_IDLE_MS = 2 * 60 * 60 * 1000; // 2h, ver spec.md "Room cleanup"
const CODE_LENGTH = 4;
// Excluye caracteres visualmente ambiguos (0/O/1/I) — ver design.md "Room codes".
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const rooms = new Map<string, RoomState>();

export function generateRoomCode(): string {
  let code: string;
  do {
    code = Array.from({ length: CODE_LENGTH }, () =>
      CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
    ).join('');
  } while (rooms.has(code));
  return code;
}

export function createRoom(
  gameType: GameType,
  hostId: string,
  hostUsername: string,
  categoria?: string,
): RoomState {
  const code = generateRoomCode();
  const now = Date.now();

  const room: RoomState = {
    code,
    gameType,
    hostId,
    players: new Map(),
    createdAt: now,
    lastActivity: now,
  };

  if (gameType === 'impostor-live') {
    room.impostor = {
      bag: createShuffleBag(contentBanks.impostorWords),
      game: null,
      phase: 'lobby',
    };
  } else if (gameType === 'hombre-lobo-live') {
    room.hombreLobo = createHombreLoboLobbyState();
  } else {
    // Sala de Trivia en vivo escogida por categoría (o el pool completo si se
    // omite/`todas`) — ver design.md "Category chosen at room creation, not
    // mid-game". La validación de categoría desconocida vive en
    // rooms.route.ts, así que aquí ya se asume una categoría válida.
    const pool =
      categoria && categoria !== 'todas'
        ? contentBanks.triviaQuestions.filter((question) => question.categoria === categoria)
        : contentBanks.triviaQuestions;

    room.trivia = {
      bag: createShuffleBag(pool),
      currentQuestion: null,
      questionStartedAt: null,
      timerMs: 20_000,
      answers: new Map(),
      scores: new Map(),
      questionsAsked: 0,
    };
  }

  room.players.set(hostId, {
    id: hostId,
    username: hostUsername,
    isHost: true,
    connected: false, // se marca true cuando el host abre la conexión WS
    socket: null,
    disconnectedAt: null,
    graceTimer: null,
  });

  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): RoomState | undefined {
  return rooms.get(code.toUpperCase());
}

export function touchRoom(room: RoomState): void {
  room.lastActivity = Date.now();
}

export function deleteRoom(code: string): void {
  rooms.delete(code.toUpperCase());
}

export function allRooms(): RoomState[] {
  return [...rooms.values()];
}

/**
 * Añade o reconecta un jugador. Si ya existía y tenía un temporizador de
 * gracia pendiente, lo cancela y conserva su estado previo (rol asignado,
 * puntuación) — ver spec.md "Reconnect within grace period".
 */
export function joinOrReconnect(
  room: RoomState,
  playerId: string,
  username: string,
  socket: RoomSocket,
): { player: Player; reconnected: boolean } {
  const existing = room.players.get(playerId);
  touchRoom(room);

  if (existing) {
    if (existing.graceTimer) {
      clearTimeout(existing.graceTimer);
      existing.graceTimer = null;
    }
    existing.connected = true;
    existing.disconnectedAt = null;
    existing.socket = socket;
    return { player: existing, reconnected: true };
  }

  const player: Player = {
    id: playerId,
    username,
    isHost: playerId === room.hostId,
    connected: true,
    socket,
    disconnectedAt: null,
    graceTimer: null,
  };
  room.players.set(playerId, player);
  return { player, reconnected: false };
}

/**
 * Marca a un jugador como desconectado y arranca el período de gracia. Si el
 * temporizador expira sin reconexión, invoca onExpire (liberar el hueco y
 * notificar al resto — spec.md "Slot freed after grace period").
 */
export function markDisconnected(
  room: RoomState,
  playerId: string,
  onExpire: (room: RoomState, playerId: string) => void,
  graceMs: number = RECONNECT_GRACE_MS,
): void {
  const player = room.players.get(playerId);
  if (!player) return;

  player.connected = false;
  player.socket = null;
  player.disconnectedAt = Date.now();
  player.graceTimer = setTimeout(() => {
    const current = room.players.get(playerId);
    if (current && !current.connected) {
      room.players.delete(playerId);
      onExpire(room, playerId);
    }
  }, graceMs);
}

export function cleanupIdleRooms(): number {
  const now = Date.now();
  let removed = 0;
  for (const [code, room] of rooms.entries()) {
    const anyoneConnected = [...room.players.values()].some((p) => p.connected);
    if (!anyoneConnected && now - room.lastActivity > ROOM_IDLE_MS) {
      rooms.delete(code);
      removed++;
    }
  }
  return removed;
}

// Exportado solo para tests.
export function __resetRoomsForTests(): void {
  rooms.clear();
}
