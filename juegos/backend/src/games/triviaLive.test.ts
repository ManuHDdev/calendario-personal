import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoom, joinOrReconnect, __resetRoomsForTests } from '../rooms/roomStore';
import { handleStartQuestion, handleAnswer, closeQuestion } from './triviaLive';
import type { RoomSocket } from '../rooms/types';

function fakeSocket(): RoomSocket {
  return { send: vi.fn(), close: vi.fn() };
}

describe('triviaLive', () => {
  beforeEach(() => __resetRoomsForTests());

  it('only the host can start a question', () => {
    const room = createRoom('trivia-live', 'host', 'Host');
    joinOrReconnect(room, 'host', 'Host', fakeSocket());
    joinOrReconnect(room, 'p2', 'Ana', fakeSocket());
    const result = handleStartQuestion(room, 'p2');
    expect(result.error).toBeDefined();
  });

  it('counts exactly one answer per player per question', () => {
    const room = createRoom('trivia-live', 'host', 'Host');
    joinOrReconnect(room, 'host', 'Host', fakeSocket());
    joinOrReconnect(room, 'p2', 'Ana', fakeSocket());
    const start = 1_000_000;
    handleStartQuestion(room, 'host', start);

    const first = handleAnswer(room, 'p2', 'cualquiera', start + 1000);
    expect(first.error).toBeUndefined();
    const second = handleAnswer(room, 'p2', 'otra', start + 2000);
    expect(second.error).toBeDefined();
    expect(room.trivia!.answers.size).toBe(1);
  });

  it('rejects a late answer submitted after the timer expires', () => {
    const room = createRoom('trivia-live', 'host', 'Host');
    joinOrReconnect(room, 'host', 'Host', fakeSocket());
    joinOrReconnect(room, 'p2', 'Ana', fakeSocket());
    const start = 1_000_000;
    handleStartQuestion(room, 'host', start);

    const late = handleAnswer(room, 'p2', 'tarde', start + room.trivia!.timerMs + 1);
    expect(late.error).toBeDefined();
    expect(room.trivia!.answers.size).toBe(0);
  });

  it('scores correct answers and computes the scoreboard correctly across multiple questions', () => {
    const room = createRoom('trivia-live', 'host', 'Host');
    joinOrReconnect(room, 'host', 'Host', fakeSocket());
    joinOrReconnect(room, 'p2', 'Ana', fakeSocket());
    joinOrReconnect(room, 'p3', 'Luis', fakeSocket());

    // Pregunta 1
    let start = 1_000_000;
    handleStartQuestion(room, 'host', start);
    const q1 = room.trivia!.currentQuestion!;
    handleAnswer(room, 'p2', q1.correcta, start + 500); // correcto
    handleAnswer(room, 'p3', 'incorrecta-siempre', start + 500); // incorrecto
    let closeResult = closeQuestion(room);
    let scoreboard = closeResult.broadcast!.scoreboard as { playerId: string; score: number }[];
    expect(scoreboard.find((s) => s.playerId === 'p2')!.score).toBe(1);
    expect(scoreboard.find((s) => s.playerId === 'p3')!.score).toBe(0);

    // Pregunta 2
    start = 2_000_000;
    handleStartQuestion(room, 'host', start);
    const q2 = room.trivia!.currentQuestion!;
    handleAnswer(room, 'p2', q2.correcta, start + 500);
    handleAnswer(room, 'p3', q2.correcta, start + 500);
    closeResult = closeQuestion(room);
    scoreboard = closeResult.broadcast!.scoreboard as { playerId: string; score: number }[];
    expect(scoreboard.find((s) => s.playerId === 'p2')!.score).toBe(2);
    expect(scoreboard.find((s) => s.playerId === 'p3')!.score).toBe(1);
  });
});
