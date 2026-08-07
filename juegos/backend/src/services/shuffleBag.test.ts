import { describe, it, expect } from 'vitest';
import { createShuffleBag } from './shuffleBag';

describe('createShuffleBag', () => {
  it('throws on an empty pool', () => {
    expect(() => createShuffleBag([])).toThrow();
  });

  it('draws every item exactly once before repeating (no-repeat guarantee)', () => {
    const pool = Array.from({ length: 50 }, (_, i) => i);
    const bag = createShuffleBag(pool);
    const drawn = new Set<number>();
    for (let i = 0; i < pool.length; i++) {
      const item = bag.draw();
      expect(drawn.has(item)).toBe(false);
      drawn.add(item);
    }
    expect(drawn.size).toBe(pool.length);
  });

  it('reshuffles and continues drawing after exhaustion', () => {
    const pool = ['a', 'b', 'c'];
    const bag = createShuffleBag(pool);
    const firstPass = [bag.draw(), bag.draw(), bag.draw()];
    expect(new Set(firstPass).size).toBe(3);

    // Bolsa agotada: el siguiente draw debe reponer sin lanzar error.
    expect(bag.remaining()).toBe(0);
    const secondPass = [bag.draw(), bag.draw(), bag.draw()];
    expect(new Set(secondPass).size).toBe(3);
  });

  it('works for a pool of size 1 (edge case)', () => {
    const bag = createShuffleBag(['solo']);
    expect(bag.draw()).toBe('solo');
    expect(bag.draw()).toBe('solo');
    expect(bag.draw()).toBe('solo');
  });

  it('works for a pool of size 2 (edge case) — no repeat within one pass', () => {
    const bag = createShuffleBag(['x', 'y']);
    const first = bag.draw();
    const second = bag.draw();
    expect(new Set([first, second]).size).toBe(2);
    // tercera extracción: nueva pasada, cualquiera de los dos es válido
    expect(['x', 'y']).toContain(bag.draw());
  });

  it('remaining() decreases with each draw and resets on reshuffle', () => {
    const bag = createShuffleBag([1, 2, 3, 4]);
    expect(bag.remaining()).toBe(4);
    bag.draw();
    expect(bag.remaining()).toBe(3);
    bag.draw();
    bag.draw();
    bag.draw();
    expect(bag.remaining()).toBe(0);
    bag.draw();
    expect(bag.remaining()).toBe(3);
  });
});
