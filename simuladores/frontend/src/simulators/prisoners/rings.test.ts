import { describe, expect, it } from 'vitest';
import { layoutRings } from './rings';

describe('layoutRings', () => {
  it('places every ring inside the canvas without overlaps', () => {
    const lengths = [40, 25, 12, 10, 6, 4, 2, 1];
    const { rings, shown } = layoutRings(lengths, 600, 300);
    expect(shown).toBe(lengths.length);
    const placed = rings.filter((r): r is NonNullable<typeof r> => r !== null);
    for (const r of placed) {
      expect(r.x - r.r).toBeGreaterThanOrEqual(0);
      expect(r.x + r.r).toBeLessThanOrEqual(600);
      expect(r.y - r.r).toBeGreaterThanOrEqual(0);
      expect(r.y + r.r).toBeLessThanOrEqual(300);
    }
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r);
      }
  });

  it('circumference is proportional to the cycle length', () => {
    const { rings } = layoutRings([30, 15], 800, 400);
    expect(rings[0]!.r / rings[1]!.r).toBeCloseTo(2, 5);
  });

  it('keeps indices aligned and drops smallest cycles when space runs out', () => {
    const lengths = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 50];
    const res = layoutRings(lengths, 120, 80);
    expect(res.rings[12]).not.toBeNull();
    expect(res.shown).toBeLessThan(lengths.length);
  });

  it('empty canvas gives no rings', () => {
    expect(layoutRings([3], 0, 0).shown).toBe(0);
  });
});
