import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoom, joinOrReconnect, __resetRoomsForTests } from '../rooms/roomStore';
import { handleStartRound, handleSubmit, handleStop } from './stopLive';
import type { RoomSocket } from '../rooms/types';

function fakeSocket(): RoomSocket {
  return { send: vi.fn(), close: vi.fn() };
}

function setupRoom(playerCount: number) {
  const room = createRoom('stop-live', 'host', 'Host');
  joinOrReconnect(room, 'host', 'Host', fakeSocket());
  for (let i = 2; i <= playerCount; i++) {
    joinOrReconnect(room, `p${i}`, `Player${i}`, fakeSocket());
  }
  return room;
}

describe('stopLive', () => {
  beforeEach(() => __resetRoomsForTests());

  it('only the host can start a round', () => {
    const room = setupRoom(2);
    const result = handleStartRound(room, 'p2');
    expect(result.error).toBeDefined();
  });

  it('picks a letter excluding the configured hard letters', () => {
    const room = setupRoom(2);
    room.stop!.excludedLetters = ['A', 'B', 'C'];
    for (let i = 0; i < 20; i++) {
      const result = handleStartRound(room, 'host');
      expect(['A', 'B', 'C']).not.toContain(result.broadcast!.letter);
      room.stop!.phase = 'lobby'; // permitir reiniciar en el test
    }
  });

  it('cuts off the round on the first Stop and ignores further submissions', () => {
    const room = setupRoom(2);
    handleStartRound(room, 'host', 'M');

    handleSubmit(room, 'host', 'Nombre', 'Manuel');
    handleSubmit(room, 'p2', 'Nombre', 'María');

    const stopResult = handleStop(room, 'host');
    expect(stopResult.broadcast!.type).toBe('round-stopped');

    // Un segundo "¡Stop!" se rechaza.
    const secondStop = handleStop(room, 'p2');
    expect(secondStop.error).toBeDefined();

    // Envíos posteriores a la ronda cerrada se ignoran (error, no se aplican).
    const lateSubmit = handleSubmit(room, 'p2', 'Nombre', 'Mario');
    expect(lateSubmit.error).toBeDefined();
    expect(room.stop!.submissions.get('p2')!.Nombre).toBe('María');
  });

  it('scores a unique non-empty answer as 10 and empty as 0', () => {
    const room = setupRoom(2);
    handleStartRound(room, 'host', 'M');
    handleSubmit(room, 'host', 'Nombre', 'Manuel');
    // p2 deja Nombre vacío.
    const result = handleStop(room, 'host');

    const grid = result.broadcast!.grid as Record<string, Record<string, { value: string; points: number }>>;
    expect(grid.host.Nombre.points).toBe(10);
    expect(grid.p2.Nombre.points).toBe(0);
  });

  it('scores duplicate answers (case/accent-insensitive) as 5 each instead of 10', () => {
    const room = setupRoom(2);
    handleStartRound(room, 'host', 'M');
    handleSubmit(room, 'host', 'Nombre', 'María');
    handleSubmit(room, 'p2', 'Nombre', 'maria'); // mismo valor salvo mayúsculas/acentos

    const result = handleStop(room, 'host');
    const grid = result.broadcast!.grid as Record<string, Record<string, { value: string; points: number }>>;
    expect(grid.host.Nombre.points).toBe(5);
    expect(grid.p2.Nombre.points).toBe(5);
  });

  it('accumulates scores across rounds', () => {
    const room = setupRoom(2);
    handleStartRound(room, 'host', 'M');
    handleSubmit(room, 'host', 'Nombre', 'Manuel');
    const first = handleStop(room, 'host');
    const firstScoreboard = first.broadcast!.scoreboard as { playerId: string; score: number }[];
    expect(firstScoreboard.find((s) => s.playerId === 'host')!.score).toBe(10);

    const secondRound = handleStartRound(room, 'host', 'A');
    expect(secondRound.broadcast!.letter).toBe('A');
    handleSubmit(room, 'host', 'Nombre', 'Ana');
    const second = handleStop(room, 'host');
    const secondScoreboard = second.broadcast!.scoreboard as { playerId: string; score: number }[];
    expect(secondScoreboard.find((s) => s.playerId === 'host')!.score).toBe(20);
  });

  it('rejects an unknown category', () => {
    const room = setupRoom(2);
    handleStartRound(room, 'host', 'M');
    const result = handleSubmit(room, 'host', 'NoExiste', 'valor');
    expect(result.error).toBeDefined();
  });
});
