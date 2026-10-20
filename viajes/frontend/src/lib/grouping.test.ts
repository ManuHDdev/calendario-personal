import { describe, it, expect } from 'vitest';
import { computeMove, computeReorder, groupPlaces } from './grouping';
import type { Place } from '../types';

let n = 0;
function place(over: Partial<Place> = {}): Place {
  n += 1;
  return {
    id: over.id ?? `p${n}`,
    tripId: 't',
    type: 'interes',
    name: `Place ${n}`,
    lat: 0,
    lng: 0,
    address: null,
    notes: null,
    url: null,
    cost: null,
    visitDate: null,
    startTime: null,
    durationMin: null,
    checkIn: null,
    checkOut: null,
    visited: false,
    dayOrder: 0,
    ...over,
  };
}

describe('groupPlaces', () => {
  it('separates lodgings, sorted days and pending places', () => {
    const hotelLate = place({ id: 'h2', type: 'alojamiento', name: 'B', checkIn: '2026-07-03' });
    const hotelEarly = place({ id: 'h1', type: 'alojamiento', name: 'A', checkIn: '2026-07-01' });
    const d2 = place({ id: 'd2', visitDate: '2026-07-02' });
    const d1b = place({ id: 'd1b', visitDate: '2026-07-01', dayOrder: 1 });
    const d1a = place({ id: 'd1a', visitDate: '2026-07-01', dayOrder: 0 });
    const pending = place({ id: 'pend' });

    const g = groupPlaces([hotelLate, d2, d1b, pending, hotelEarly, d1a]);
    expect(g.lodgings.map((p) => p.id)).toEqual(['h1', 'h2']);
    expect(g.days.map((d) => d.date)).toEqual(['2026-07-01', '2026-07-02']);
    expect(g.days[0].places.map((p) => p.id)).toEqual(['d1a', 'd1b']);
    expect(g.pending.map((p) => p.id)).toEqual(['pend']);
  });

  it('orders by start time inside a day when dayOrder ties, untimed last', () => {
    const untimed = place({ id: 'u', visitDate: '2026-07-01' });
    const late = place({ id: 'l', visitDate: '2026-07-01', startTime: '18:00' });
    const early = place({ id: 'e', visitDate: '2026-07-01', startTime: '09:00' });
    const g = groupPlaces([untimed, late, early]);
    expect(g.days[0].places.map((p) => p.id)).toEqual(['e', 'l', 'u']);
  });
});

describe('computeReorder (drag and drop)', () => {
  const a = place({ id: 'a', visitDate: '2026-07-01', dayOrder: 0 });
  const b = place({ id: 'b', visitDate: '2026-07-01', dayOrder: 1 });
  const c = place({ id: 'c', visitDate: '2026-07-01', dayOrder: 2 });
  const x = place({ id: 'x', visitDate: '2026-07-02' });
  const pend = place({ id: 'pend' });
  const groups = groupPlaces([a, b, c, x, pend]);

  it('moves within a day, before the drop target', () => {
    expect(computeReorder(groups, 'c', '2026-07-01', 'a')).toEqual({ date: '2026-07-01', placeIds: ['c', 'a', 'b'] });
    expect(computeReorder(groups, 'a', '2026-07-01', 'c')).toEqual({ date: '2026-07-01', placeIds: ['b', 'a', 'c'] });
  });

  it('appends when dropped on the day header (no target)', () => {
    expect(computeReorder(groups, 'a', '2026-07-01', null)).toEqual({ date: '2026-07-01', placeIds: ['b', 'c', 'a'] });
  });

  it('moves between days and to/from the pending list', () => {
    expect(computeReorder(groups, 'pend', '2026-07-02', 'x')).toEqual({ date: '2026-07-02', placeIds: ['pend', 'x'] });
    expect(computeReorder(groups, 'a', null, null)).toEqual({ date: null, placeIds: ['pend', 'a'] });
  });

  it('ignores lodging and unknown ids', () => {
    const h = place({ id: 'h', type: 'alojamiento' });
    expect(computeReorder(groupPlaces([h, a]), 'h', '2026-07-01', null)).toBeNull();
    expect(computeReorder(groups, 'nope', null, null)).toBeNull();
  });
});

describe('computeMove (up/down buttons)', () => {
  const a = place({ id: 'a', visitDate: '2026-07-01', dayOrder: 0 });
  const b = place({ id: 'b', visitDate: '2026-07-01', dayOrder: 1 });
  const groups = groupPlaces([a, b]);

  it('swaps with the neighbour', () => {
    expect(computeMove(groups, 'a', 1)).toEqual({ date: '2026-07-01', placeIds: ['b', 'a'] });
    expect(computeMove(groups, 'b', -1)).toEqual({ date: '2026-07-01', placeIds: ['b', 'a'] });
  });

  it('does nothing at the edges', () => {
    expect(computeMove(groups, 'a', -1)).toBeNull();
    expect(computeMove(groups, 'b', 1)).toBeNull();
  });
});
