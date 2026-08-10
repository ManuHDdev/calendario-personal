import { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { extractToken, verifyToken } from '../middleware/auth';
import { getRoom, joinOrReconnect, markDisconnected, touchRoom } from './roomStore';
import type { RoomState } from './types';
import { handleStartRound, handleVote, handleResolveRound } from '../games/impostorLive';
import { handleStartQuestion, handleAnswer, closeQuestion } from '../games/triviaLive';
import {
  handleStartGame as handleHombreLoboStartGame,
  handleLoboVote,
  handleVidenteSee,
  handleBrujaAction,
  handleAdvancePhase,
  handleDayVote,
  handleCazadorRevenge,
} from '../games/hombreLoboLive';

// ─────────────────────────────────────────────────────────────────────────
// GET /juegos/api/ws?token=&room= — ver spec.md "Live room creation and
// join" y design.md "WebSocket room layer". Una única ruta dispatcha a
// impostor-live o trivia-live según room.gameType.
// ─────────────────────────────────────────────────────────────────────────

function playersSnapshot(room: RoomState) {
  return [...room.players.values()].map((p) => ({
    id: p.id,
    username: p.username,
    isHost: p.isHost,
    connected: p.connected,
  }));
}

function broadcast(room: RoomState, message: Record<string, unknown>): void {
  const payload = JSON.stringify(message);
  for (const player of room.players.values()) {
    if (player.connected && player.socket) player.socket.send(payload);
  }
}

function sendTo(room: RoomState, playerId: string, message: Record<string, unknown>): void {
  const player = room.players.get(playerId);
  if (player?.connected && player.socket) player.socket.send(JSON.stringify(message));
}

export async function wsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/juegos/api/ws', { websocket: true }, async (connection, request: FastifyRequest) => {
    const socket = connection as unknown as WebSocket;
    const query = request.query as Record<string, string | undefined>;
    const roomCode = query.room;

    const token = extractToken(request);
    if (!token) {
      socket.close(4401, 'Missing token');
      return;
    }

    let userId: string;
    let username: string;
    try {
      const payload = await verifyToken(token);
      if (!payload.sub) throw new Error('Token sin sub');
      userId = payload.sub;
      username = (payload.preferred_username as string | undefined) ?? 'Jugador';
    } catch {
      socket.close(4401, 'Invalid token');
      return;
    }

    if (!roomCode) {
      socket.close(4404, 'Missing room code');
      return;
    }
    const room = getRoom(roomCode);
    if (!room) {
      // spec.md "Unknown room code rejected": se cierra sin añadir jugador a ningún sitio.
      socket.close(4404, 'Room not found');
      return;
    }

    const roomSocket = {
      send: (data: string) => socket.send(data),
      close: (code?: number, reason?: string) => socket.close(code, reason),
    };

    joinOrReconnect(room, userId, username, roomSocket);
    broadcast(room, { type: 'players-updated', players: playersSnapshot(room) });

    socket.on('message', (raw: Buffer) => {
      touchRoom(room);
      let message: { type?: string; [key: string]: unknown };
      try {
        message = JSON.parse(raw.toString());
      } catch {
        sendTo(room, userId, { type: 'error', message: 'Mensaje no es JSON válido' });
        return;
      }

      const delivery = dispatch(room, userId, message);
      if (delivery.error) {
        sendTo(room, userId, { type: 'error', message: delivery.error });
        return;
      }
      if (delivery.broadcast) broadcast(room, delivery.broadcast);
      if (delivery.toPlayer) {
        for (const [pid, msg] of delivery.toPlayer.entries()) sendTo(room, pid, msg);
      }
    });

    socket.on('close', () => {
      markDisconnected(room, userId, (r, pid) => {
        broadcast(r, { type: 'players-updated', players: playersSnapshot(r), left: pid });
      });
    });
  });
}

function dispatch(room: RoomState, userId: string, message: { type?: string; [key: string]: unknown }) {
  if (room.gameType === 'impostor-live') {
    switch (message.type) {
      case 'start-round':
        return handleStartRound(room, userId, Number(message.impostorCount ?? 1));
      case 'vote':
        return handleVote(room, userId, String(message.votedForId ?? ''));
      case 'resolve-round':
        return handleResolveRound(room, userId);
      default:
        return { error: `Tipo de mensaje desconocido: ${message.type}` };
    }
  }

  if (room.gameType === 'hombre-lobo-live') {
    switch (message.type) {
      case 'start-game':
        return handleHombreLoboStartGame(
          room,
          userId,
          message.playersPerLobo !== undefined ? Number(message.playersPerLobo) : undefined,
        );
      case 'lobo-vote':
        return handleLoboVote(room, userId, String(message.targetId ?? ''));
      case 'vidente-see':
        return handleVidenteSee(room, userId, String(message.targetId ?? ''));
      case 'bruja-action':
        return handleBrujaAction(room, userId, {
          heal: message.heal === true,
          killTargetId: typeof message.killTargetId === 'string' ? message.killTargetId : undefined,
        });
      case 'advance-phase':
        return handleAdvancePhase(room, userId);
      case 'day-vote':
        return handleDayVote(room, userId, String(message.targetId ?? ''));
      case 'cazador-revenge':
        return handleCazadorRevenge(room, userId, String(message.targetId ?? ''));
      default:
        return { error: `Tipo de mensaje desconocido: ${message.type}` };
    }
  }

  // trivia-live
  switch (message.type) {
    case 'start-question':
      return handleStartQuestion(room, userId);
    case 'answer':
      return handleAnswer(room, userId, String(message.answer ?? ''));
    case 'close-question':
      return closeQuestion(room);
    default:
      return { error: `Tipo de mensaje desconocido: ${message.type}` };
  }
}
