import { describe, expect, it } from 'vitest';
import { extent, logTicks, makeScale, niceStep, niceTicks } from './chartScale';

describe('chart scales', () => {
  it('niceStep picks round steps', () => {
    expect(niceStep(10, 5)).toBe(2);
    expect(niceStep(1, 4)).toBe(0.25);
    expect(niceStep(1000, 4)).toBe(250);
  });

  it('niceTicks covers the range with round values', () => {
    expect(niceTicks(0, 1, 4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(niceTicks(3, 3)).toEqual([3]);
    const t = niceTicks(0.3, 9.7, 5);
    expect(t[0]).toBeGreaterThanOrEqual(0.3);
    expect(t[t.length - 1]).toBeLessThanOrEqual(9.7);
  });

  it('logTicks returns powers of ten', () => {
    expect(logTicks(1, 1000)).toEqual([1, 10, 100, 1000]);
    expect(logTicks(5, 5000)).toEqual([10, 100, 1000]);
    expect(logTicks(0, 10)).toEqual([]);
  });

  it('makeScale maps linearly and logarithmically', () => {
    const lin = makeScale([0, 10], [0, 100]);
    expect(lin(5)).toBe(50);
    const flipped = makeScale([0, 1], [200, 0]);
    expect(flipped(0.25)).toBe(150);
    const log = makeScale([1, 100], [0, 2], true);
    expect(log(10)).toBeCloseTo(1, 12);
  });

  it('extent ignores NaN', () => {
    expect(extent([3, NaN, -1, 8])).toEqual([-1, 8]);
    expect(extent([])).toBeNull();
  });
});
