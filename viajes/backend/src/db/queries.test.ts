import { describe, expect, it } from 'vitest';
import { buildUpdate, toPlace, toTrip } from './queries';

describe('buildUpdate', () => {
  const allowed = { name: 'name', visitDate: 'visit_date', startTime: 'start_time' };

  it('numbers placeholders from the given start index and keeps null (clearing a column)', () => {
    const { sets, values } = buildUpdate({ name: 'Museo', startTime: null }, allowed, 3);
    expect(sets).toEqual(['name = $3', 'start_time = $4']);
    expect(values).toEqual(['Museo', null]);
  });

  it('skips undefined fields', () => {
    const { sets, values } = buildUpdate({ name: undefined, visitDate: '2026-07-01' }, allowed, 1);
    expect(sets).toEqual(['visit_date = $1']);
    expect(values).toEqual(['2026-07-01']);
  });

  it('never lets request keys outside the allowlist reach the SQL text', () => {
    const { sets, values } = buildUpdate({ name: 'x', 'id = id; DROP TABLE trip; --': 1, activo: false }, allowed, 1);
    expect(sets).toEqual(['name = $1']);
    expect(values).toEqual(['x']);
    expect(sets.join(' ')).not.toMatch(/DROP|activo/);
  });
});

describe('row mapping', () => {
  it('maps a place row, trimming the TIME to HH:MM', () => {
    const place = toPlace({
      id: 'p1',
      trip_id: 't1',
      type: 'interes',
      name: 'Museo',
      lat: 38.9,
      lng: -6.3,
      address: null,
      notes: null,
      url: null,
      cost: 12.5,
      visit_date: '2026-07-01',
      start_time: '10:30:00',
      duration_min: 90,
      check_in: null,
      check_out: null,
      visited: false,
      day_order: 2,
    });
    expect(place).toMatchObject({ tripId: 't1', startTime: '10:30', visitDate: '2026-07-01', durationMin: 90, dayOrder: 2, cost: 12.5 });
  });

  it('maps a trip row and serialises timestamps as ISO strings', () => {
    const trip = toTrip({
      id: 't1',
      name: 'Lisboa',
      description: null,
      start_date: '2026-07-01',
      end_date: null,
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: '2026-01-02T00:00:00.000Z',
    });
    expect(trip.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(trip.updatedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(trip.startDate).toBe('2026-07-01');
  });
});
