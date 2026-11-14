import { randInt, type Rng } from './random';

/**
 * Monty Hall with n doors: one car, n−1 goats. After the first pick the host,
 * who knows where the car is, opens every other door except one, always
 * revealing goats. The player then stays or switches to the remaining door.
 */

export interface MontyHallGame {
  doors: number;
  prize: number;
  firstPick: number;
  /** Doors opened by the host (all goats). */
  opened: number[];
  /** The single other door left closed. */
  remaining: number;
}

/** Host behaviour given where the car is and the first pick. */
export function hostReveal(doors: number, prize: number, firstPick: number, rng: Rng): MontyHallGame {
  let remaining: number;
  if (firstPick === prize) {
    // The car is behind the player's door: any goat door may stay closed.
    const others = Array.from({ length: doors }, (_, i) => i).filter((d) => d !== firstPick);
    remaining = others[randInt(rng, others.length)];
  } else {
    remaining = prize;
  }
  const opened = Array.from({ length: doors }, (_, i) => i).filter((d) => d !== firstPick && d !== remaining);
  return { doors, prize, firstPick, opened, remaining };
}

export function randomGame(doors: number, rng: Rng): MontyHallGame {
  return hostReveal(doors, randInt(rng, doors), randInt(rng, doors), rng);
}

export function stayWins(game: MontyHallGame): boolean {
  return game.firstPick === game.prize;
}

export function switchWins(game: MontyHallGame): boolean {
  return game.remaining === game.prize;
}

export function theoreticalStay(doors: number): number {
  return 1 / doors;
}

export function theoreticalSwitch(doors: number): number {
  return (doors - 1) / doors;
}
