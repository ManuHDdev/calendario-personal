import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createRoom,
  getRoom,
  joinOrReconnect,
  markDisconnected,
  generateRoomCode,
  cleanupIdleRooms,
  __resetRoomsForTests,
} from './roomStore';
import type { RoomSocket } from './types';

function fakeSocket(): RoomSocket {
  return { send: vi.fn(), close: vi.fn() };
}

describe('roomStore', () => {
  beforeEach(() => __resetRoomsForTests());

  it('generateRoomCode produces a 4-char uppercase code without ambiguous characters', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(4);
    expect(code).toBe(code.toUpperCase());
    expect(code).not.toMatch(/[0O1I]/);
  });

  it('createRoom registers the host and stores the room in the map', () => {
    const room = createRoom('impostor-live', 'host-1', 'Manu');
    expect(getRoom(room.code)).toBe(room);
    expect(room.hostId).toBe('host-1');
    expect(room.impostor).toBeDefined();
  });

  it('an unknown room code is not found', () => {
    expect(getRoom('ZZZZ')).toBeUndefined();
  });

  it('joinOrReconnect adds a new player and broadcasts-worthy state (player list grows)', () => {
    const room = createRoom('trivia-live', 'host-1', 'Manu');
    const { player, reconnected } = joinOrReconnect(room, 'p2', 'Ana', fakeSocket());
    expect(reconnected).toBe(false);
    expect(player.username).toBe('Ana');
    expect(room.players.size).toBe(2); // host + p2
  });

  it('reconnecting within the grace period preserves prior state and cancels the timer', () => {
    vi.useFakeTimers();
    const room = createRoom('impostor-live', 'host-1', 'Manu');
    joinOrReconnect(room, 'p2', 'Ana', fakeSocket());
    room.impostor!.roleByPlayer.set('p2', { playerId: 'p2', isImpostor: false, word: 'Playa' });

    const onExpire = vi.fn();
    markDisconnected(room, 'p2', onExpire);
    expect(room.players.get('p2')!.connected).toBe(false);

    // Reconecta a los 30s, dentro del período de gracia de 60s
    vi.advanceTimersByTime(30_000);
    const { reconnected } = joinOrReconnect(room, 'p2', 'Ana', fakeSocket());
    expect(reconnected).toBe(true);
    expect(room.impostor!.roleByPlayer.get('p2')?.word).toBe('Playa');

    // El temporizador de expiración fue cancelado: avanzar más no debe expulsar al jugador
    vi.advanceTimersByTime(60_000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(room.players.has('p2')).toBe(true);

    vi.useRealTimers();
  });

  it('frees the slot and notifies remaining players after the grace period expires', () => {
    vi.useFakeTimers();
    const room = createRoom('impostor-live', 'host-1', 'Manu');
    joinOrReconnect(room, 'p2', 'Ana', fakeSocket());

    const onExpire = vi.fn();
    markDisconnected(room, 'p2', onExpire, 60_000);

    vi.advanceTimersByTime(59_000);
    expect(room.players.has('p2')).toBe(true);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2_000);
    expect(room.players.has('p2')).toBe(false);
    expect(onExpire).toHaveBeenCalledWith(room, 'p2');

    vi.useRealTimers();
  });

  it('cleanupIdleRooms drops rooms with no connected players idle beyond the threshold', () => {
    vi.useFakeTimers();
    const room = createRoom('trivia-live', 'host-1', 'Manu');
    room.lastActivity = Date.now() - (2 * 60 * 60 * 1000 + 1000);
    const removed = cleanupIdleRooms();
    expect(removed).toBe(1);
    expect(getRoom(room.code)).toBeUndefined();
    vi.useRealTimers();
  });

  it('cleanupIdleRooms keeps rooms with at least one connected player', () => {
    const room = createRoom('trivia-live', 'host-1', 'Manu');
    joinOrReconnect(room, 'host-1', 'Manu', fakeSocket());
    room.lastActivity = Date.now() - (3 * 60 * 60 * 1000);
    const removed = cleanupIdleRooms();
    expect(removed).toBe(0);
    expect(getRoom(room.code)).toBeDefined();
  });
});
