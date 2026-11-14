import { describe, it, expect } from 'vitest';
import { formatViewbox, hitKind, hitName, hitSubtitle, nextIndex } from './addressSearch';

describe('formatViewbox', () => {
  it('orders west,north,east,south and rounds', () => {
    expect(formatViewbox({ west: 2.123456, north: 48.9, east: 2.5, south: 48.8 })).toBe('2.1235,48.9,2.5,48.8');
  });
  it('clamps a world-wide view into the valid range', () => {
    expect(formatViewbox({ west: -400, north: 95, east: 400, south: -95 })).toBe('-180,90,180,-90');
  });
  it('returns null for degenerate or non-finite boxes', () => {
    expect(formatViewbox({ west: 3, north: 10, east: 3, south: 5 })).toBeNull();
    expect(formatViewbox({ west: 1, north: Number.NaN, east: 2, south: 0 })).toBeNull();
  });
});

describe('hit helpers', () => {
  const legacy = { lat: 1, lng: 2, displayName: 'Plaza Mayor, Madrid, España' };
  it('derives name, subtitle and kind for legacy hits', () => {
    expect(hitName(legacy)).toBe('Plaza Mayor');
    expect(hitSubtitle(legacy)).toBe('Madrid, España');
    expect(hitKind(legacy)).toBe('otro');
  });
  it('prefers the enriched fields', () => {
    const hit = { ...legacy, name: 'Museo', locality: 'París, Francia', kind: 'interes' as const };
    expect(hitName(hit)).toBe('Museo');
    expect(hitSubtitle(hit)).toBe('París, Francia');
    expect(hitKind(hit)).toBe('interes');
  });
});

describe('nextIndex', () => {
  it('moves down and wraps to the first item', () => {
    expect(nextIndex(-1, 'ArrowDown', 3)).toBe(0);
    expect(nextIndex(0, 'ArrowDown', 3)).toBe(1);
    expect(nextIndex(2, 'ArrowDown', 3)).toBe(0);
  });
  it('moves up and wraps to the last item', () => {
    expect(nextIndex(-1, 'ArrowUp', 3)).toBe(2);
    expect(nextIndex(0, 'ArrowUp', 3)).toBe(2);
    expect(nextIndex(2, 'ArrowUp', 3)).toBe(1);
  });
  it('supports Home/End and empty lists', () => {
    expect(nextIndex(1, 'Home', 4)).toBe(0);
    expect(nextIndex(1, 'End', 4)).toBe(3);
    expect(nextIndex(0, 'ArrowDown', 0)).toBe(-1);
  });
});
