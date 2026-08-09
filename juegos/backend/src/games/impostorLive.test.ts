import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoom, joinOrReconnect, __resetRoomsForTests } from '../rooms/roomStore';
import { handleStartRound, handleVote, handleResolveRound } from './impostorLive';
import type { RoomSocket } from '../rooms/types';

function fakeSocket(): RoomSocket {
  return { send: vi.fn(), close: vi.fn() };
}

function joinPlayers(room: ReturnType<typeof createRoom>, ids: [string, string][]) {
  for (const [id, name] of ids) joinOrReconnect(room, id, name, fakeSocket());
}

describe('impostorLive.handleStartRound', () => {
  beforeEach(() => __resetRoomsForTests());

  it('rejects starting with fewer than 4 connected players', () => {
    const room = createRoom('impostor-live', 'host', 'Host');
    joinPlayers(room, [
      ['host', 'Host'],
      ['p2', 'Ana'],
      ['p3', 'Luis'],
    ]);
    const result = handleStartRound(room, 'host', 1);
    expect(result.error).toBeDefined();
  });

  it('rejects a non-host trying to start the round', () => {
    const room = createRoom('impostor-live', 'host', 'Host');
    joinPlayers(room, [
      ['host', 'Host'],
      ['p2', 'Ana'],
      ['p3', 'Luis'],
      ['p4', 'Eva'],
    ]);
    const result = handleStartRound(room, 'p2', 1);
    expect(result.error).toBeDefined();
  });

  it('rejects an impostor count above floor((n-1)/2)', () => {
    const room = createRoom('impostor-live', 'host', 'Host');
    joinPlayers(room, [
      ['host', 'Host'],
      ['p2', 'Ana'],
      ['p3', 'Luis'],
      ['p4', 'Eva'],
    ]);
    // 4 players -> max 1 impostor
    const result = handleStartRound(room, 'host', 2);
    expect(result.error).toBeDefined();
  });

  it('delivers a private role payload to each player, with exactly N impostors and no cross-impostor identification', () => {
    const room = createRoom('impostor-live', 'host', 'Host');
    joinPlayers(room, [
      ['host', 'Host'],
      ['p2', 'Ana'],
      ['p3', 'Luis'],
      ['p4', 'Eva'],
      ['p5', 'Nora'],
      ['p6', 'Tom'],
      ['p7', 'Ivan'],
      ['p8', 'Sara'],
    ]);

    const result = handleStartRound(room, 'host', 2);
    expect(result.error).toBeUndefined();
    expect(result.toPlayer).toBeDefined();

    const impostorEntries = [...result.toPlayer!.entries()].filter(([, msg]) => msg.isImpostor === true);
    expect(impostorEntries).toHaveLength(2);
    for (const [, msg] of impostorEntries) {
      expect(msg.word).toBeNull();
      // El payload de un impostor nunca incluye la lista de impostores.
      expect(msg).not.toHaveProperty('impostorIds');
      expect(msg).not.toHaveProperty('otherImpostors');
    }

    const nonImpostorEntries = [...result.toPlayer!.entries()].filter(([, msg]) => msg.isImpostor === false);
    expect(nonImpostorEntries).toHaveLength(6);
    for (const [, msg] of nonImpostorEntries) expect(typeof msg.word).toBe('string');
  });
});

describe('impostorLive.handleVote / handleResolveRound', () => {
  beforeEach(() => __resetRoomsForTests());

  function setupRoom(playerCount: number, impostorCount: number) {
    const room = createRoom('impostor-live', 'host', 'Host');
    const ids: [string, string][] = [['host', 'Host']];
    for (let i = 2; i <= playerCount; i++) ids.push([`p${i}`, `Jugador${i}`]);
    joinPlayers(room, ids);
    handleStartRound(room, 'host', impostorCount);
    return room;
  }

  it('tallies votes and, once resolved, does not end the game if impostors remain above the threshold', () => {
    const room = setupRoom(6, 1);
    const game = room.impostor!.game!;
    const impostorId = [...game.impostorIds][0];
    const crewIds = game.alive.filter((id) => id !== impostorId);

    handleVote(room, crewIds[0], crewIds[1]);
    const tallyResult = handleVote(room, crewIds[1], crewIds[1]);
    expect(tallyResult.broadcast?.type).toBe('vote-tally');

    for (const voter of game.alive) {
      if (voter !== crewIds[0] && voter !== crewIds[1]) handleVote(room, voter, crewIds[1]);
    }

    const resolveResult = handleResolveRound(room, 'host');
    expect(resolveResult.broadcast?.type).toBe('round-eliminated');
    expect(resolveResult.broadcast?.eliminatedId).toBe(crewIds[1]);
    // Nunca se filtra si el eliminado era o no impostor.
    expect(resolveResult.broadcast).not.toHaveProperty('wasImpostor');
  });

  it('ends the game with a full reveal once the last impostor is eliminated', () => {
    const room = setupRoom(4, 1);
    const game = room.impostor!.game!;
    const impostorId = [...game.impostorIds][0];

    for (const voter of game.alive) handleVote(room, voter, impostorId);

    const resolveResult = handleResolveRound(room, 'host');
    expect(resolveResult.broadcast?.type).toBe('game-ended');
    expect(resolveResult.broadcast?.winner).toBe('crew');
    expect(resolveResult.broadcast?.impostorIds).toEqual([impostorId]);
  });

  it('rejects a non-host forcing the round resolution', () => {
    const room = setupRoom(4, 1);
    const game = room.impostor!.game!;
    const result = handleResolveRound(room, game.alive.find((id) => id !== 'host')!);
    expect(result.error).toBeDefined();
  });

  it('a tied vote resolves with no elimination and the game continues', () => {
    const room = setupRoom(4, 1);
    const game = room.impostor!.game!;
    const [a, b] = game.alive;
    handleVote(room, a, b);
    handleVote(room, b, a);

    const resolveResult = handleResolveRound(room, 'host');
    expect(resolveResult.broadcast?.type).toBe('round-eliminated');
    expect(resolveResult.broadcast?.eliminatedId).toBeNull();
  });
});
