import { assignRoles, recordVote, tallyVotes, type ImpostorRound } from './impostorGame';
import type { RoomState } from '../rooms/types';

// ─────────────────────────────────────────────────────────────────────────
// Adaptador de El Impostor en vivo sobre RoomState — reutiliza
// games/impostorGame.ts (misma lógica que el modo pass-and-play, ver
// design.md "Shared domain logic"). Cada handler es una función pura que
// recibe el RoomState y devuelve un plan de mensajes a entregar; quien la
// llama (rooms/ws.route.ts) es responsable de escribir en los sockets.
// ─────────────────────────────────────────────────────────────────────────

export interface Delivery {
  broadcast?: Record<string, unknown>;
  toPlayer?: Map<string, Record<string, unknown>>;
  error?: string;
}

export function handleStartRound(room: RoomState, requesterId: string): Delivery {
  if (!room.impostor) return { error: 'Esta sala no es de Impostor en vivo' };
  if (requesterId !== room.hostId) return { error: 'Solo el host puede iniciar la ronda' };

  const connectedPlayerIds = [...room.players.values()].filter((p) => p.connected).map((p) => p.id);
  if (connectedPlayerIds.length < 3) {
    return { error: 'Se necesitan al menos 3 jugadores conectados para empezar' };
  }

  const { palabra, categoria } = room.impostor.bag.draw();
  const { impostorId, roles } = assignRoles(connectedPlayerIds, palabra);

  const round: ImpostorRound = { word: palabra, categoria, impostorId, roles, votes: {} };
  room.impostor.round = round;
  room.impostor.phase = 'roles-revealed';
  room.impostor.roleByPlayer = new Map(roles.map((r) => [r.playerId, r]));

  const toPlayer = new Map<string, Record<string, unknown>>();
  for (const role of roles) {
    toPlayer.set(role.playerId, {
      type: 'role-assigned',
      isImpostor: role.isImpostor,
      word: role.word,
      categoria,
    });
  }

  return {
    broadcast: { type: 'round-started', playerCount: connectedPlayerIds.length },
    toPlayer,
  };
}

export function handleVote(room: RoomState, playerId: string, votedForId: string): Delivery {
  if (!room.impostor?.round) return { error: 'No hay ninguna ronda en curso' };

  room.impostor.round = recordVote(room.impostor.round, playerId, votedForId);
  room.impostor.phase = 'voting';

  const connectedCount = [...room.players.values()].filter((p) => p.connected).length;
  const votesCount = Object.keys(room.impostor.round.votes).length;
  const allVoted = votesCount >= connectedCount;

  const tally = tallyVotes(room.impostor.round);
  return {
    broadcast: {
      type: 'vote-tally',
      counts: tally.counts,
      votesCount,
      connectedCount,
      allVoted,
    },
  };
}

export function handleReveal(room: RoomState, requesterId: string): Delivery {
  if (!room.impostor?.round) return { error: 'No hay ninguna ronda en curso' };
  if (requesterId !== room.hostId) return { error: 'Solo el host puede forzar la revelación' };

  const tally = tallyVotes(room.impostor.round);
  room.impostor.phase = 'reveal';

  return {
    broadcast: {
      type: 'reveal',
      impostorId: room.impostor.round.impostorId,
      word: room.impostor.round.word,
      wasImpostorCaught: tally.wasImpostorCaught,
      mostVotedId: tally.mostVotedId,
    },
  };
}
