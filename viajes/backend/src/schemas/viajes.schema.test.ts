import { describe, it, expect } from 'vitest';
import {
  createPlaceSchema,
  createTripSchema,
  distanceQuerySchema,
  itineraryQuerySchema,
  matrixQuerySchema,
  reorderSchema,
  updatePlaceSchema,
  updateTripSchema,
} from './viajes.schema';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const validPlace = { type: 'interes', name: 'Museo', lat: 38.9, lng: -6.3 };

describe('createTripSchema', () => {
  it('accepts a minimal and a full trip', () => {
    expect(createTripSchema.safeParse({ name: 'Lisboa' }).success).toBe(true);
    expect(
      createTripSchema.safeParse({ name: 'Lisboa', description: 'x', startDate: '2026-07-01', endDate: '2026-07-10' }).success,
    ).toBe(true);
  });

  it('rejects empty names, bad dates, impossible dates and reversed ranges', () => {
    expect(createTripSchema.safeParse({ name: '  ' }).success).toBe(false);
    expect(createTripSchema.safeParse({ name: 'a', startDate: '01/07/2026' }).success).toBe(false);
    expect(createTripSchema.safeParse({ name: 'a', startDate: '2026-02-31' }).success).toBe(false);
    expect(createTripSchema.safeParse({ name: 'a', startDate: '2026-07-10', endDate: '2026-07-01' }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(createTripSchema.safeParse({ name: 'a', owner: 'me' }).success).toBe(false);
  });
});

describe('updateTripSchema', () => {
  it('requires at least one field', () => {
    expect(updateTripSchema.safeParse({}).success).toBe(false);
    expect(updateTripSchema.safeParse({ description: null }).success).toBe(true);
  });
});

describe('createPlaceSchema', () => {
  it('accepts a valid place with optional scheduling', () => {
    const r = createPlaceSchema.safeParse({
      ...validPlace,
      visitDate: '2026-07-01',
      startTime: '09:30',
      durationMin: 60,
      cost: 12.5,
      url: 'https://example.com',
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown types and out-of-range coordinates', () => {
    expect(createPlaceSchema.safeParse({ ...validPlace, type: 'hotel' }).success).toBe(false);
    expect(createPlaceSchema.safeParse({ ...validPlace, lat: 91 }).success).toBe(false);
    expect(createPlaceSchema.safeParse({ ...validPlace, lng: -181 }).success).toBe(false);
    expect(createPlaceSchema.safeParse({ ...validPlace, lat: '38.9' }).success).toBe(false);
  });

  it('rejects a start time without a visit date and malformed times', () => {
    expect(createPlaceSchema.safeParse({ ...validPlace, startTime: '09:30' }).success).toBe(false);
    expect(createPlaceSchema.safeParse({ ...validPlace, visitDate: '2026-07-01', startTime: '24:00' }).success).toBe(false);
    expect(createPlaceSchema.safeParse({ ...validPlace, visitDate: '2026-07-01', startTime: '9:30' }).success).toBe(false);
  });

  it('rejects javascript:/non-http URLs, negative cost and bad durations', () => {
    expect(createPlaceSchema.safeParse({ ...validPlace, url: 'javascript:alert(1)' }).success).toBe(false);
    expect(createPlaceSchema.safeParse({ ...validPlace, url: 'not a url' }).success).toBe(false);
    expect(createPlaceSchema.safeParse({ ...validPlace, cost: -1 }).success).toBe(false);
    expect(createPlaceSchema.safeParse({ ...validPlace, visitDate: '2026-07-01', durationMin: 0 }).success).toBe(false);
  });

  it('rejects a check-out before the check-in', () => {
    const lodging = { ...validPlace, type: 'alojamiento' };
    expect(createPlaceSchema.safeParse({ ...lodging, checkIn: '2026-07-03', checkOut: '2026-07-01' }).success).toBe(false);
    expect(createPlaceSchema.safeParse({ ...lodging, checkIn: '2026-07-01', checkOut: '2026-07-03' }).success).toBe(true);
  });
});

describe('updatePlaceSchema', () => {
  it('allows partial updates and null to clear fields, but not empty bodies', () => {
    expect(updatePlaceSchema.safeParse({ visited: true }).success).toBe(true);
    expect(updatePlaceSchema.safeParse({ visitDate: null, cost: null }).success).toBe(true);
    expect(updatePlaceSchema.safeParse({}).success).toBe(false);
    expect(updatePlaceSchema.safeParse({ id: 'x' }).success).toBe(false);
  });
});

describe('reorderSchema', () => {
  it('accepts a day or the unscheduled list and rejects duplicates / non-uuids', () => {
    expect(reorderSchema.safeParse({ date: '2026-07-01', placeIds: [uuid(1), uuid(2)] }).success).toBe(true);
    expect(reorderSchema.safeParse({ date: null, placeIds: [uuid(1)] }).success).toBe(true);
    expect(reorderSchema.safeParse({ date: null, placeIds: [uuid(1), uuid(1)] }).success).toBe(false);
    expect(reorderSchema.safeParse({ date: null, placeIds: ['nope'] }).success).toBe(false);
    expect(reorderSchema.safeParse({ date: null, placeIds: [] }).success).toBe(false);
  });
});

describe('query schemas', () => {
  it('defaults profile to driving and validates the enum', () => {
    expect(itineraryQuerySchema.parse({}).profile).toBe('driving');
    expect(itineraryQuerySchema.safeParse({ profile: 'plane' }).success).toBe(false);
    expect(itineraryQuerySchema.parse({ profile: 'bike', withLodging: 'false' }).withLodging).toBe('false');
  });

  it('coerces and bounds distance coordinates', () => {
    const ok = distanceQuerySchema.parse({ fromLat: '38.9', fromLng: '-6.3', toLat: '39', toLng: '-6' });
    expect(ok.fromLat).toBe(38.9);
    expect(distanceQuerySchema.safeParse({ fromLat: '95', fromLng: '0', toLat: '0', toLng: '0' }).success).toBe(false);
    expect(distanceQuerySchema.safeParse({ fromLat: 'abc', fromLng: '0', toLat: '0', toLng: '0' }).success).toBe(false);
  });

  it('parses and bounds matrix ids (2..10 uuids)', () => {
    expect(matrixQuerySchema.parse({ ids: `${uuid(1)},${uuid(2)}` }).ids).toHaveLength(2);
    expect(matrixQuerySchema.safeParse({ ids: uuid(1) }).success).toBe(false);
    expect(matrixQuerySchema.safeParse({ ids: `${uuid(1)},oops` }).success).toBe(false);
    const eleven = Array.from({ length: 11 }, (_, i) => uuid(i + 1)).join(',');
    expect(matrixQuerySchema.safeParse({ ids: eleven }).success).toBe(false);
  });
});
