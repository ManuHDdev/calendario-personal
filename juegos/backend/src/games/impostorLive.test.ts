import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoom, joinOrReconnect, __resetRoomsForTests } from '../rooms/roomStore';
import { handleStartRound, handleVote, handleReveal } from './impostorLive';
import type { RoomSocket } from '../rooms/types';

function fakeSocket(): RoomSocket {
  return { send: vi.fn(), close: vi.fn() };
}

describe('impostorLive.handleStartRound', () => {
  beforeEach(() => __resetRoomsForTests());

  it('rejects starting with fewer than 3 connected players', () => {
    const room = createRoom('impostor-live', 'host', 'Host');
    joinOrReconnect(room, 'host', 'Host', fakeSocket());
    joinOrReconnect(room, 'p2', 'Ana', fakeSocket());
    const result = handleStartRound(room, 'host');
    expect(result.error).toBeDefined();
  });

  it('rejects a non-host trying to start the round', () => {
    const room = createRoom('impostor-live', 'host', 'Host');
    joinOrReconnect(room, 'host', 'Host', fakeSocket());
    joinOrReconnect(room, 'p2', 'Ana', fakeSocket());
    joinOrReconnect(room, 'p3', 'Luis', fakeSocket());
    const result = handleStartRound(room, 'p2');
    expect(result.error).toBeDefined();
  });

  it('delivers the impostor payload only to the impostor socket (private delivery)', () => {
    const room = createRoom('impostor-live', 'host', 'Host');
    joinOrReconnect(room, 'host', 'Host', fakeSocket());
    joinOrReconnect(room, 'p2', 'Ana', fakeSocket());
    joinOrReconnect(room, 'p3', 'Luis', fakeSocket());
    joinOrReconnect(room, 'p4', 'Eva', fakeSocket());
    joinOrReconnect(room, 'p5', 'Nora', fakeSocket());

    const result = handleStartRound(room, 'host');
    expect(result.error).toBeUndefined();
    expect(result.toPlayer).toBeDefined();

    const impostorEntries = [...result.toPlayer!.entries()].filter(([, msg]) => msg.isImpostor === true);
    expect(impostorEntries).toHaveLength(1);
    const [, impostorMsg] = impostorEntries[0];
    expect(impostorMsg.word).toBeNull();

    const nonImpostorEntries = [...result.toPlayer!.entries()].filter(([, msg]) => msg.isImpostor === false);
    expect(nonImpostorEntries).toHaveLength(4);
    for (const [, msg] of nonImpostorEntries) expect(typeof msg.word).toBe('string');
  });
});

describe('impostorLive.handleVote / handleReveal', () => {
  beforeEach(() => __resetRoomsForTests());

  it('tallies votes and reveal identifies the impostor and the word', () => {
    const room = createRoom('impostor-live', 'host', 'Host');
    joinOrReconnect(room, 'host', 'Host', fakeSocket());
    joinOrReconnect(room, 'p2', 'Ana', fakeSocket());
    joinOrReconnect(room, 'p3', 'Luis', fakeSocket());
    handleStartRound(room, 'host');

    const impostorId = room.impostor!.round!.impostorId;
    const others = [...room.players.keys()].filter((id) => id !== impostorId);

    handleVote(room, others[0], impostorId);
    const tallyResult = handleVote(room, others[1], impostorId);
    expect(tallyResult.broadcast?.type).toBe('vote-tally');

    const revealResult = handleReveal(room, 'host');
    expect(revealResult.broadcast?.type).toBe('reveal');
    expect(revealResult.broadcast?.impostorId).toBe(impostorId);
    expect(revealResult.broadcast?.wasImpostorCaught).toBe(true);
  });

  it('rejects a non-host forcing the reveal', () => {
    const room = createRoom('impostor-live', 'host', 'Host');
    joinOrReconnect(room, 'host', 'Host', fakeSocket());
    joinOrReconnect(room, 'p2', 'Ana', fakeSocket());
    joinOrReconnect(room, 'p3', 'Luis', fakeSocket());
    handleStartRound(room, 'host');
    const result = handleReveal(room, 'p2');
    expect(result.error).toBeDefined();
  });
});
