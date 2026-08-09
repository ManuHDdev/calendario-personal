import {
  startGame,
  recordVote,
  tallyVotes,
  applyElimination,
  maxImpostors,
  MIN_PLAYERS,
  type ImpostorGameState,
} from './impostorGame';
import type { RoomState } from '../rooms/types';

// ─────────────────────────────────────────────────────────────────────────
// Adaptador de El Impostor en vivo sobre RoomState — reutiliza
// games/impostorGame.ts (misma lógica que el modo pass-and-play, ver
// design.md "El Impostor: elimination loop, not single-round reveal"). Cada
// handler es una función pura que recibe el RoomState y devuelve un plan de
// mensajes a entregar; quien la llama (rooms/ws.route.ts) es responsable de
// escribir en los sockets.
// ─────────────────────────────────────────────────────────────────────────

export interface Delivery {
  broadcast?: Record<string, unknown>;
  toPlayer?: Map<string, Record<string, unknown>>;
  error?: string;
}

export function handleStartRound(room: RoomState, requesterId: string, impostorCount: number): Delivery {
  if (!room.impostor) return { error: 'Esta sala no es de Impostor en vivo' };
  if (requesterId !== room.hostId) return { error: 'Solo el host puede iniciar la ronda' };

  const connectedPlayerIds = [...room.players.values()].filter((p) => p.connected).map((p) => p.id);
  if (connectedPlayerIds.length < MIN_PLAYERS) {
    return { error: `Se necesitan al menos ${MIN_PLAYERS} jugadores conectados para empezar` };
  }
  const max = maxImpostors(connectedPlayerIds.length);
  if (!Number.isInteger(impostorCount) || impostorCount < 1 || impostorCount > max) {
    return { error: `El número de impostores debe ser un entero entre 1 y ${max}` };
  }

  const { palabra, categoria } = room.impostor.bag.draw();
  const game: ImpostorGameState = startGame(connectedPlayerIds, impostorCount, palabra, categoria);

  room.impostor.game = game;
  room.impostor.phase = 'roles-revealed';

  const toPlayer = new Map<string, Record<string, unknown>>();
  for (const role of game.roles) {
    toPlayer.set(role.playerId, {
      type: 'role-assigned',
      isImpostor: role.isImpostor,
      word: role.word,
      categoria,
    });
  }

  return {
    broadcast: { type: 'round-started', playerCount: connectedPlayerIds.length, impostorCount },
    toPlayer,
  };
}

export function handleVote(room: RoomState, playerId: string, votedForId: string): Delivery {
  const game = room.impostor?.game;
  if (!game || game.ended) return { error: 'No hay ninguna ronda en curso' };
  if (!game.alive.includes(playerId)) return { error: 'Un jugador eliminado no puede votar' };
  if (!game.alive.includes(votedForId)) return { error: 'Solo se puede votar a jugadores en juego' };

  const nextGame = recordVote(game, playerId, votedForId);
  room.impostor!.game = nextGame;
  room.impostor!.phase = 'voting';

  const connectedAliveCount = [...room.players.values()].filter(
    (p) => p.connected && nextGame.alive.includes(p.id),
  ).length;
  const votesCount = Object.keys(nextGame.votes).length;
  const allVoted = votesCount >= connectedAliveCount;

  const tally = tallyVotes(nextGame.votes);
  return {
    broadcast: {
      type: 'vote-tally',
      counts: tally.counts,
      votesCount,
      connectedCount: connectedAliveCount,
      allVoted,
    },
  };
}

/** El host resuelve la ronda actual: elimina al más votado (o nadie, en empate),
 * comprueba fin de partida, y o bien anuncia la eliminación y abre una nueva
 * ronda de discusión, o bien revela el resultado final de la partida. */
export function handleResolveRound(room: RoomState, requesterId: string): Delivery {
  const game = room.impostor?.game;
  if (!game || game.ended) return { error: 'No hay ninguna ronda en curso' };
  if (requesterId !== room.hostId) return { error: 'Solo el host puede resolver la ronda' };

  const result = applyElimination(game);
  room.impostor!.game = result.state;

  if (result.gameEnd.ended) {
    room.impostor!.phase = 'reveal';
    return {
      broadcast: {
        type: 'game-ended',
        winner: result.gameEnd.winner,
        word: result.state.word,
        impostorIds: [...result.state.impostorIds],
        eliminatedId: result.eliminatedId,
      },
    };
  }

  room.impostor!.phase = 'discussion';
  return {
    broadcast: {
      type: 'round-eliminated',
      // null = empate, nadie fue eliminado esta ronda (spec.md "Tied vote eliminates no one").
      eliminatedId: result.eliminatedId,
      alive: result.state.alive,
    },
  };
}
