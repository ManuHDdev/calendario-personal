import { describe, it, expect } from 'vitest';
import {
  assignRoles,
  startGame,
  recordVote,
  resolveElimination,
  checkGameEnd,
  applyElimination,
  maxImpostors,
} from './impostorGame';

describe('maxImpostors', () => {
  it('computes floor((n-1)/2)', () => {
    expect(maxImpostors(4)).toBe(1);
    expect(maxImpostors(5)).toBe(2);
    expect(maxImpostors(8)).toBe(3);
    expect(maxImpostors(9)).toBe(4);
  });
});

describe('assignRoles', () => {
  it('assigns exactly the requested number of impostors', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const { roles } = assignRoles(players, 2, 'Playa');
    const impostors = roles.filter((r) => r.isImpostor);
    expect(impostors).toHaveLength(2);
  });

  it('never gives the word to an impostor', () => {
    const players = ['p1', 'p2', 'p3', 'p4'];
    const { roles } = assignRoles(players, 1, 'Guitarra');
    const impostorRole = roles.find((r) => r.isImpostor)!;
    expect(impostorRole.word).toBeNull();
  });

  it('gives the word to every non-impostor player', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    const { roles } = assignRoles(players, 1, 'Elefante');
    const nonImpostors = roles.filter((r) => !r.isImpostor);
    expect(nonImpostors).toHaveLength(5);
    for (const r of nonImpostors) expect(r.word).toBe('Elefante');
  });

  it('throws with fewer than 4 players', () => {
    expect(() => assignRoles(['p1', 'p2', 'p3'], 1, 'Palabra')).toThrow();
  });

  it('rejects an impostorCount above floor((n-1)/2)', () => {
    // 5 players -> max 2 impostors
    expect(() => assignRoles(['p1', 'p2', 'p3', 'p4', 'p5'], 3, 'Palabra')).toThrow();
  });

  it('rejects an impostorCount below 1', () => {
    expect(() => assignRoles(['p1', 'p2', 'p3', 'p4'], 0, 'Palabra')).toThrow();
  });

  it('distributes the impostor role across different players over many rounds', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const { impostorIds } = assignRoles(players, 1, 'Palabra');
      seen.add(impostorIds[0]);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('startGame', () => {
  it('produces a game state with the word, category, roles and full alive roster', () => {
    const game = startGame(['p1', 'p2', 'p3', 'p4'], 1, 'Playa', 'lugares');
    expect(game.word).toBe('Playa');
    expect(game.categoria).toBe('lugares');
    expect(game.roles).toHaveLength(4);
    expect(game.alive).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(game.eliminated).toEqual([]);
    expect(game.votes).toEqual({});
    expect(game.ended).toBe(false);
  });
});

describe('resolveElimination', () => {
  it('returns the most-voted player id', () => {
    const votes = { p1: 'p3', p2: 'p3', p4: 'p1' };
    expect(resolveElimination(votes)).toBe('p3');
  });

  it('returns null on a tie', () => {
    const votes = { p1: 'p2', p2: 'p1' };
    expect(resolveElimination(votes)).toBeNull();
  });
});

describe('checkGameEnd', () => {
  it('reports no winner while multiple impostors remain among more than 3 players', () => {
    const game = startGame(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], 2, 'Palabra', 'comida');
    expect(checkGameEnd(game)).toEqual({ ended: false, winner: null });
  });

  it('declares the crew the winner the instant the last impostor is eliminated, even with >3 players left', () => {
    const game = startGame(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], 1, 'Palabra', 'comida');
    const impostorId = [...game.impostorIds][0];
    const stateAfterElimination = { ...game, alive: game.alive.filter((id) => id !== impostorId) };
    expect(checkGameEnd(stateAfterElimination)).toEqual({ ended: true, winner: 'crew' });
  });

  it('declares the impostors the winner exactly when 3 players remain and one is an impostor', () => {
    const game = startGame(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], 2, 'Palabra', 'comida');
    // Deja exactamente 3 vivos, conservando al menos un impostor.
    const impostorId = [...game.impostorIds][0];
    const others = game.alive.filter((id) => id !== impostorId).slice(0, 2);
    const stateAtThree = { ...game, alive: [impostorId, ...others] };
    expect(checkGameEnd(stateAtThree)).toEqual({ ended: true, winner: 'impostors' });
  });
});

describe('applyElimination', () => {
  it('eliminates the most-voted player and does not end the game when impostors remain above the threshold', () => {
    const game = startGame(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], 1, 'Palabra', 'comida');
    const impostorId = [...game.impostorIds][0];
    const crewIds = game.alive.filter((id) => id !== impostorId);
    // Todo el mundo vota a un tripulante que no es el impostor.
    let state = game;
    for (const voter of game.alive) {
      state = recordVote(state, voter, crewIds[0]);
    }
    const result = applyElimination(state);
    expect(result.eliminatedId).toBe(crewIds[0]);
    expect(result.gameEnd.ended).toBe(false);
    expect(result.state.alive).not.toContain(crewIds[0]);
    expect(result.state.alive).toHaveLength(5);
    // El estado devuelto no revela si el eliminado era o no impostor.
    expect(result.state).not.toHaveProperty('eliminatedWasImpostor');
  });

  it('ends the game with the crew as winner the instant the last impostor is eliminated', () => {
    const game = startGame(['p1', 'p2', 'p3', 'p4'], 1, 'Palabra', 'comida');
    const impostorId = [...game.impostorIds][0];
    let state = game;
    for (const voter of game.alive) {
      state = recordVote(state, voter, impostorId);
    }
    const result = applyElimination(state);
    expect(result.eliminatedId).toBe(impostorId);
    expect(result.gameEnd).toEqual({ ended: true, winner: 'crew' });
    expect(result.state.ended).toBe(true);
    expect(result.state.winner).toBe('crew');
  });

  it('ends the game with the impostors as winner exactly at the 3-player threshold', () => {
    const game = startGame(['p1', 'p2', 'p3', 'p4'], 1, 'Palabra', 'comida');
    const impostorId = [...game.impostorIds][0];
    const crewIds = game.alive.filter((id) => id !== impostorId);
    let state = game;
    for (const voter of game.alive) {
      state = recordVote(state, voter, crewIds[0]);
    }
    const result = applyElimination(state);
    expect(result.gameEnd).toEqual({ ended: true, winner: 'impostors' });
    expect(result.state.alive).toHaveLength(3);
  });

  it('eliminates no one on a tied vote and the game continues', () => {
    const game = startGame(['p1', 'p2', 'p3', 'p4'], 1, 'Palabra', 'comida');
    let state = recordVote(game, 'p1', 'p2');
    state = recordVote(state, 'p2', 'p1');
    const result = applyElimination(state);
    expect(result.eliminatedId).toBeNull();
    expect(result.gameEnd.ended).toBe(false);
    expect(result.state.alive).toHaveLength(4);
    expect(result.state.votes).toEqual({});
  });
});
