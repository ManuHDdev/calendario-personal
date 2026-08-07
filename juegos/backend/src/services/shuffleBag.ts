// Shuffle-bag: draw-without-replacement scoped to one game session (ver
// design.md, "Content volume and no-repeat guarantee"). Fisher–Yates shuffle
// al crear/reponer la bolsa; draw() saca el siguiente elemento y reshuffles
// automáticamente al agotarse.

export interface ShuffleBag<T> {
  draw(): T;
  remaining(): number;
}

function fisherYatesShuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createShuffleBag<T>(pool: T[]): ShuffleBag<T> {
  if (pool.length === 0) {
    throw new Error('createShuffleBag: pool no puede estar vacío');
  }

  let bag: T[] = fisherYatesShuffle(pool);

  return {
    draw(): T {
      if (bag.length === 0) {
        bag = fisherYatesShuffle(pool);
      }
      // pop() es O(1) y no importa el orden restante, ya viene barajado.
      return bag.pop() as T;
    },
    remaining(): number {
      return bag.length;
    },
  };
}
