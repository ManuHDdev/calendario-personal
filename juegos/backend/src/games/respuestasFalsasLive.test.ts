import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoom, joinOrReconnect, __resetRoomsForTests } from '../rooms/roomStore';
import {
  handleStartQuestion,
  handleSubmitAnswer,
  handleForceVoting,
  handleVote,
  handleForceReveal,
} from './respuestasFalsasLive';
import type { RoomSocket } from '../rooms/types';

function fakeSocket(): RoomSocket {
  return { send: vi.fn(), close: vi.fn() };
}

function setupRoom(playerCount: number) {
  const room = createRoom('respuestas-falsas-live', 'host', 'Host');
  joinOrReconnect(room, 'host', 'Host', fakeSocket());
  for (let i = 2; i <= playerCount; i++) {
    joinOrReconnect(room, `p${i}`, `Player${i}`, fakeSocket());
  }
  return room;
}

describe('respuestasFalsasLive', () => {
  beforeEach(() => __resetRoomsForTests());

  it('only the host can start a question', () => {
    const room = setupRoom(2);
    const result = handleStartQuestion(room, 'p2');
    expect(result.error).toBeDefined();
  });

  it('never leaks respuestaReal in the question broadcast', () => {
    const room = setupRoom(2);
    const result = handleStartQuestion(room, 'host');
    expect(result.broadcast).toBeDefined();
    expect(JSON.stringify(result.broadcast)).not.toContain(room.respuestasFalsas!.currentQuestion!.respuestaReal);
    expect(result.broadcast!.pregunta).toBe(room.respuestasFalsas!.currentQuestion!.pregunta);
  });

  it('auto-opens voting once every connected player has submitted', () => {
    const room = setupRoom(3);
    handleStartQuestion(room, 'host');

    const first = handleSubmitAnswer(room, 'host', 'respuesta falsa host');
    expect(first.broadcast!.type).toBe('answer-submitted');
    const second = handleSubmitAnswer(room, 'p2', 'respuesta falsa p2');
    expect(second.broadcast!.type).toBe('answer-submitted');
    const third = handleSubmitAnswer(room, 'p3', 'respuesta falsa p3');
    expect(third.broadcast!.type).toBe('voting-open');

    const options = third.broadcast!.options as { id: string; text: string }[];
    expect(options).toHaveLength(4); // 3 falsas + 1 real
    // Ninguna opción expone quién la escribió antes del reveal.
    for (const opt of options) {
      expect(Object.keys(opt).sort()).toEqual(['id', 'text']);
    }
  });

  it('rejects a player voting for the option containing their own submission', () => {
    const room = setupRoom(2);
    handleStartQuestion(room, 'host');
    handleSubmitAnswer(room, 'host', 'respuesta de host');
    const openResult = handleSubmitAnswer(room, 'p2', 'respuesta de p2');
    expect(openResult.broadcast!.type).toBe('voting-open');

    const hostOption = room.respuestasFalsas!.options!.find((o) => o.authorId === 'host')!;
    const rejected = handleVote(room, 'host', hostOption.id);
    expect(rejected.error).toBeDefined();
  });

  it('force-voting lets the host open voting before everyone submits', () => {
    const room = setupRoom(3);
    handleStartQuestion(room, 'host');
    handleSubmitAnswer(room, 'host', 'respuesta de host');

    const blocked = handleForceVoting(room, 'p2');
    expect(blocked.error).toBeDefined();

    const forced = handleForceVoting(room, 'host');
    expect(forced.broadcast!.type).toBe('voting-open');
  });

  it('rewards correct guesses and successful deception on reveal', () => {
    const room = setupRoom(3);
    handleStartQuestion(room, 'host');
    handleSubmitAnswer(room, 'host', 'respuesta falsa de host');
    handleSubmitAnswer(room, 'p2', 'respuesta falsa de p2');
    handleSubmitAnswer(room, 'p3', 'respuesta falsa de p3');

    const options = room.respuestasFalsas!.options!;
    const realOption = options.find((o) => o.authorId === null)!;
    const hostFakeOption = options.find((o) => o.authorId === 'host')!;

    // host y p2 votan la real; p3 vota la falsa de host (queda "engañado").
    handleVote(room, 'host', realOption.id);
    const revealResult = handleVote(room, 'p2', realOption.id);
    expect(revealResult.broadcast!.type).toBe('vote-received'); // aún falta el voto de p3

    const finalReveal = handleVote(room, 'p3', hostFakeOption.id);
    expect(finalReveal.broadcast!.type).toBe('reveal');
    expect(finalReveal.broadcast!.realOptionId).toBe(realOption.id);

    const scoreboard = finalReveal.broadcast!.scoreboard as { playerId: string; score: number }[];
    // host votó la real (+1) y su falsa engañó a p3 (+1) = 2
    expect(scoreboard.find((s) => s.playerId === 'host')!.score).toBe(2);
    // p2 votó la real (+1)
    expect(scoreboard.find((s) => s.playerId === 'p2')!.score).toBe(1);
    // p3 fue engañado, no acierta nada
    expect(scoreboard.find((s) => s.playerId === 'p3')!.score).toBe(0);
  });

  it('force-reveal lets the host reveal before everyone votes', () => {
    const room = setupRoom(2);
    handleStartQuestion(room, 'host');
    handleSubmitAnswer(room, 'host', 'respuesta de host');
    handleSubmitAnswer(room, 'p2', 'respuesta de p2');

    const blocked = handleForceReveal(room, 'p2');
    expect(blocked.error).toBeDefined();

    const forced = handleForceReveal(room, 'host');
    expect(forced.broadcast!.type).toBe('reveal');
  });
});
