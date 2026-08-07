import { describe, it, expect } from 'vitest';
import { assignRoles, startRound, recordVote, tallyVotes } from './impostorGame';

describe('assignRoles', () => {
  it('assigns exactly one impostor per round', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const { roles } = assignRoles(players, 'Playa');
    const impostors = roles.filter((r) => r.isImpostor);
    expect(impostors).toHaveLength(1);
  });

  it('never gives the word to the impostor', () => {
    const players = ['p1', 'p2', 'p3', 'p4'];
    const { roles } = assignRoles(players, 'Guitarra');
    const impostorRole = roles.find((r) => r.isImpostor)!;
    expect(impostorRole.word).toBeNull();
  });

  it('gives the word to every non-impostor player', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    const { roles } = assignRoles(players, 'Elefante');
    const nonImpostors = roles.filter((r) => !r.isImpostor);
    expect(nonImpostors).toHaveLength(5);
    for (const r of nonImpostors) expect(r.word).toBe('Elefante');
  });

  it('throws with fewer than 3 players', () => {
    expect(() => assignRoles(['p1', 'p2'], 'Palabra')).toThrow();
  });

  it('distributes the impostor role across different players over many rounds (not always the same index)', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const impostorsSeen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const { impostorId } = assignRoles(players, 'Palabra');
      impostorsSeen.add(impostorId);
    }
    expect(impostorsSeen.size).toBeGreaterThan(1);
  });
});

describe('startRound', () => {
  it('produces a round with the word, category, impostor and per-player roles', () => {
    const round = startRound(['p1', 'p2', 'p3'], 'Playa', 'lugares');
    expect(round.word).toBe('Playa');
    expect(round.categoria).toBe('lugares');
    expect(round.roles).toHaveLength(3);
    expect(round.votes).toEqual({});
  });
});

describe('recordVote / tallyVotes', () => {
  it('tallies votes correctly and detects when the impostor is caught', () => {
    let round = startRound(['p1', 'p2', 'p3', 'p4'], 'Palabra', 'comida');
    const impostorId = round.impostorId;
    const others = round.roles.filter((r) => r.playerId !== impostorId).map((r) => r.playerId);

    round = recordVote(round, others[0], impostorId);
    round = recordVote(round, others[1], impostorId);
    round = recordVote(round, others[2], others[0]);

    const tally = tallyVotes(round);
    expect(tally.counts[impostorId]).toBe(2);
    expect(tally.mostVotedId).toBe(impostorId);
    expect(tally.wasImpostorCaught).toBe(true);
  });

  it('reports no winner on a tie', () => {
    let round = startRound(['p1', 'p2', 'p3', 'p4'], 'Palabra', 'comida');
    round = recordVote(round, 'p1', 'p2');
    round = recordVote(round, 'p2', 'p1');

    const tally = tallyVotes(round);
    expect(tally.mostVotedId).toBeNull();
  });

  it('reports the impostor not caught when votes point elsewhere', () => {
    let round = startRound(['p1', 'p2', 'p3'], 'Palabra', 'comida');
    const impostorId = round.impostorId;
    const others = round.roles.filter((r) => r.playerId !== impostorId).map((r) => r.playerId);
    round = recordVote(round, others[0], others[1]);
    round = recordVote(round, impostorId, others[1]);

    const tally = tallyVotes(round);
    expect(tally.wasImpostorCaught).toBe(false);
  });
});
