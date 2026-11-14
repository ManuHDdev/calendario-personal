import { describe, expect, it } from 'vitest';
import { hostReveal, randomGame, stayWins, switchWins, theoreticalStay, theoreticalSwitch } from './montyHall';
import { mulberry32 } from './random';

describe('host behaviour', () => {
  it('never opens the player’s door or the car', () => {
    const rng = mulberry32(4);
    for (let t = 0; t < 500; t++) {
      const g = randomGame(5, rng);
      expect(g.opened).not.toContain(g.firstPick);
      expect(g.opened).not.toContain(g.prize);
      expect(g.opened.length).toBe(3);
      expect(g.remaining).not.toBe(g.firstPick);
    }
  });

  it('leaves the car closed when the first pick is a goat', () => {
    const g = hostReveal(3, 2, 0, mulberry32(1));
    expect(g.remaining).toBe(2);
    expect(g.opened).toEqual([1]);
  });

  it('exactly one of stay/switch wins', () => {
    const rng = mulberry32(5);
    for (let t = 0; t < 200; t++) {
      const g = randomGame(4, rng);
      expect(stayWins(g) !== switchWins(g)).toBe(true);
    }
  });
});

describe('Monte Carlo', () => {
  it('switching wins ≈ 2/3 with three doors', () => {
    const rng = mulberry32(1234);
    let sw = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (switchWins(randomGame(3, rng))) sw++;
    expect(Math.abs(sw / n - 2 / 3)).toBeLessThan(0.015);
  });

  it('with n doors switching wins ≈ (n−1)/n', () => {
    const rng = mulberry32(77);
    let sw = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) if (switchWins(randomGame(10, rng))) sw++;
    expect(Math.abs(sw / n - theoreticalSwitch(10))).toBeLessThan(0.015);
    expect(theoreticalStay(10)).toBeCloseTo(0.1, 12);
  });
});
