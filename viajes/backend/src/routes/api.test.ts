import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSign, generateKeyPairSync } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { makePlace } from '../lib/place.fixture';

// Real RS256 tokens verified by the real middleware; only the JWKS lookup and
// the database layer are replaced.
const keys = vi.hoisted(() => ({ publicPem: '' }));

vi.mock('jwks-rsa', () => ({
  default: () => ({ getSigningKey: async () => ({ getPublicKey: () => keys.publicPem }) }),
}));

vi.mock('../db/queries', () => ({
  listTrips: vi.fn(),
  getTrip: vi.fn(),
  createTrip: vi.fn(),
  updateTrip: vi.fn(),
  softDeleteTrip: vi.fn(),
  listPlaces: vi.fn(),
  getPlace: vi.fn(),
  createPlace: vi.fn(),
  updatePlace: vi.fn(),
  softDeletePlace: vi.fn(),
  reorderPlaces: vi.fn(),
}));

import * as q from '../db/queries';
import { buildApp } from '../app';
import { DEFAULT_BASE_URLS } from '../lib/routing';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
keys.publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

function tokenFor(roles: string[], expOffset = 3600): string {
  const header = b64({ alg: 'RS256', kid: 'k1' });
  const payload = b64({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + expOffset, realm_access: { roles } });
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey).toString('base64url')}`;
}

const auth = (roles: string[]) => ({ authorization: `Bearer ${tokenFor(roles)}` });

const TRIP_ID = '11111111-1111-4111-8111-111111111111';
const trip = {
  id: TRIP_ID,
  name: 'Lisboa',
  description: null,
  startDate: null,
  endDate: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

let app: FastifyInstance;
const failingFetch = vi.fn(async () => {
  throw new Error('offline');
});

beforeAll(async () => {
  app = await buildApp({
    routing: { baseUrls: DEFAULT_BASE_URLS, timeoutMs: 50, userAgent: 't', fetchFn: failingFetch as unknown as typeof fetch, cache: null },
    geocoder: { search: vi.fn(async () => []), reverse: vi.fn(async () => []) },
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(q.listTrips).mockResolvedValue([]);
  vi.mocked(q.getTrip).mockResolvedValue(trip);
  vi.mocked(q.listPlaces).mockResolvedValue([]);
  vi.mocked(q.createTrip).mockResolvedValue(trip);
});

describe('authentication', () => {
  it('rejects requests without a token or with a garbage token (401)', async () => {
    expect((await app.inject({ method: 'GET', url: '/viajes/api/trips' })).statusCode).toBe(401);
    const bad = await app.inject({ method: 'GET', url: '/viajes/api/trips', headers: { authorization: 'Bearer abc.def.ghi' } });
    expect(bad.statusCode).toBe(401);
  });

  it('rejects an expired token (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/viajes/api/trips',
      headers: { authorization: `Bearer ${tokenFor(['admin'], -60)}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('keeps /health open', async () => {
    expect((await app.inject({ method: 'GET', url: '/viajes/api/health' })).statusCode).toBe(200);
  });
});

describe('role gating', () => {
  it.each(['admin', 'familia', 'viajes_admin', 'viajes_invitado'])('%s can read trips', async (role) => {
    const res = await app.inject({ method: 'GET', url: '/viajes/api/trips', headers: auth([role]) });
    expect(res.statusCode).toBe(200);
  });

  it.each(['invitado', 'reparto_admin', 'mapacyd_invitado'])('%s cannot read trips (403)', async (role) => {
    const res = await app.inject({ method: 'GET', url: '/viajes/api/trips', headers: auth([role]) });
    expect(res.statusCode).toBe(403);
  });

  it.each(['admin', 'viajes_admin'])('%s can create a trip (201)', async (role) => {
    const res = await app.inject({
      method: 'POST',
      url: '/viajes/api/trips',
      headers: auth([role]),
      payload: { name: 'Lisboa' },
    });
    expect(res.statusCode).toBe(201);
    expect(q.createTrip).toHaveBeenCalledWith({ name: 'Lisboa' }, 'user-1');
  });

  it.each(['familia', 'viajes_invitado'])('%s is read-only: every write route answers 403', async (role) => {
    const headers = auth([role]);
    const place = '22222222-2222-4222-8222-222222222222';
    const calls = [
      { method: 'POST', url: '/viajes/api/trips', payload: { name: 'x' } },
      { method: 'PATCH', url: `/viajes/api/trips/${TRIP_ID}`, payload: { name: 'x' } },
      { method: 'DELETE', url: `/viajes/api/trips/${TRIP_ID}` },
      { method: 'POST', url: `/viajes/api/trips/${TRIP_ID}/places`, payload: { type: 'interes', name: 'x', lat: 1, lng: 1 } },
      { method: 'PATCH', url: `/viajes/api/trips/${TRIP_ID}/places/${place}`, payload: { visited: true } },
      { method: 'DELETE', url: `/viajes/api/trips/${TRIP_ID}/places/${place}` },
      { method: 'POST', url: `/viajes/api/trips/${TRIP_ID}/reorder`, payload: { date: null, placeIds: [place] } },
    ] as const;
    for (const call of calls) {
      const res = await app.inject({ ...call, headers });
      expect(res.statusCode, `${call.method} ${call.url}`).toBe(403);
    }
    expect(q.createTrip).not.toHaveBeenCalled();
    expect(q.softDeleteTrip).not.toHaveBeenCalled();
  });
});

describe('trips and places', () => {
  it('validates the body before touching the database (400)', async () => {
    const res = await app.inject({ method: 'POST', url: '/viajes/api/trips', headers: auth(['admin']), payload: { name: '' } });
    expect(res.statusCode).toBe(400);
    expect(q.createTrip).not.toHaveBeenCalled();
  });

  it('answers 404 for malformed or unknown trip ids without hitting the database for malformed ones', async () => {
    const malformed = await app.inject({ method: 'GET', url: '/viajes/api/trips/not-a-uuid', headers: auth(['admin']) });
    expect(malformed.statusCode).toBe(404);
    expect(q.getTrip).not.toHaveBeenCalled();

    vi.mocked(q.getTrip).mockResolvedValue(null);
    const unknown = await app.inject({ method: 'GET', url: `/viajes/api/trips/${TRIP_ID}`, headers: auth(['admin']) });
    expect(unknown.statusCode).toBe(404);
  });

  it('returns the trip with its places', async () => {
    const p = makePlace({ name: 'Torre de Belém' });
    vi.mocked(q.listPlaces).mockResolvedValue([p]);
    const res = await app.inject({ method: 'GET', url: `/viajes/api/trips/${TRIP_ID}`, headers: auth(['viajes_invitado']) });
    expect(res.statusCode).toBe(200);
    expect(res.json().places[0].name).toBe('Torre de Belém');
  });

  it('creates a place with normalised nulls', async () => {
    vi.mocked(q.createPlace).mockResolvedValue(makePlace());
    const res = await app.inject({
      method: 'POST',
      url: `/viajes/api/trips/${TRIP_ID}/places`,
      headers: auth(['viajes_admin']),
      payload: { type: 'interes', name: 'Museo', lat: 38.9, lng: -6.3 },
    });
    expect(res.statusCode).toBe(201);
    expect(vi.mocked(q.createPlace).mock.calls[0][1]).toMatchObject({ address: null, visitDate: null, cost: null });
  });

  it('clears the start time when a place is unscheduled', async () => {
    vi.mocked(q.updatePlace).mockResolvedValue(makePlace());
    const placeId = '22222222-2222-4222-8222-222222222222';
    await app.inject({
      method: 'PATCH',
      url: `/viajes/api/trips/${TRIP_ID}/places/${placeId}`,
      headers: auth(['admin']),
      payload: { visitDate: null },
    });
    expect(q.updatePlace).toHaveBeenCalledWith(TRIP_ID, placeId, { visitDate: null, startTime: null });
  });

  it('refuses a start time on a place that has no day', async () => {
    vi.mocked(q.getPlace).mockResolvedValue(makePlace({ visitDate: null }));
    const res = await app.inject({
      method: 'PATCH',
      url: `/viajes/api/trips/${TRIP_ID}/places/22222222-2222-4222-8222-222222222222`,
      headers: auth(['admin']),
      payload: { startTime: '10:00' },
    });
    expect(res.statusCode).toBe(400);
    expect(q.updatePlace).not.toHaveBeenCalled();
  });

  it('rejects a reorder that references foreign places (400)', async () => {
    vi.mocked(q.reorderPlaces).mockResolvedValue(false);
    const res = await app.inject({
      method: 'POST',
      url: `/viajes/api/trips/${TRIP_ID}/reorder`,
      headers: auth(['admin']),
      payload: { date: '2026-07-01', placeIds: ['22222222-2222-4222-8222-222222222222'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('soft-deletes a trip (204) and 404s when it is already gone', async () => {
    vi.mocked(q.softDeleteTrip).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const ok = await app.inject({ method: 'DELETE', url: `/viajes/api/trips/${TRIP_ID}`, headers: auth(['admin']) });
    expect(ok.statusCode).toBe(204);
    const gone = await app.inject({ method: 'DELETE', url: `/viajes/api/trips/${TRIP_ID}`, headers: auth(['admin']) });
    expect(gone.statusCode).toBe(404);
  });
});

describe('distance, itinerary and exports', () => {
  it('falls back to straight-line distance flagged approx when routing is offline', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/viajes/api/distance?fromLat=38.9&fromLng=-6.3&toLat=39.0&toLng=-6.2&profile=foot',
      headers: auth(['viajes_invitado']),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.approx).toBe(true);
    expect(body.distanceM).toBe(body.straightM);
    expect(body.durationS).toBeGreaterThan(0);
  });

  it('rejects an unknown profile (400)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/viajes/api/distance?fromLat=1&fromLng=1&toLat=2&toLng=2&profile=plane',
      headers: auth(['admin']),
    });
    expect(res.statusCode).toBe(400);
  });

  it('builds the day itinerary with totals (offline fallback)', async () => {
    const a = makePlace({ name: 'A', visitDate: '2026-07-01', lat: 38.9, lng: -6.3 });
    const b = makePlace({ name: 'B', visitDate: '2026-07-01', dayOrder: 1, lat: 38.95, lng: -6.25 });
    vi.mocked(q.listPlaces).mockResolvedValue([b, a]);
    const res = await app.inject({
      method: 'GET',
      url: `/viajes/api/trips/${TRIP_ID}/itinerary?withLodging=false`,
      headers: auth(['admin']),
    });
    expect(res.statusCode).toBe(200);
    const day = res.json().days[0];
    expect(day.stops.map((s: { name: string }) => s.name)).toEqual(['A', 'B']);
    expect(day.totalDistanceM).toBeGreaterThan(0);
    expect(day.approx).toBe(true);
  });

  it('serves GPX and ICS downloads with attachment headers', async () => {
    vi.mocked(q.listPlaces).mockResolvedValue([makePlace({ visitDate: '2026-07-01' })]);
    const gpx = await app.inject({ method: 'GET', url: `/viajes/api/trips/${TRIP_ID}/export.gpx`, headers: auth(['viajes_invitado']) });
    expect(gpx.statusCode).toBe(200);
    expect(gpx.headers['content-type']).toContain('application/gpx+xml');
    expect(gpx.headers['content-disposition']).toBe('attachment; filename="lisboa.gpx"');
    expect(gpx.body).toContain('<gpx');

    const ics = await app.inject({ method: 'GET', url: `/viajes/api/trips/${TRIP_ID}/export.ics`, headers: auth(['admin']) });
    expect(ics.headers['content-type']).toContain('text/calendar');
    expect(ics.body).toContain('BEGIN:VCALENDAR');
  });

  it('requires a role for the exports too', async () => {
    const res = await app.inject({ method: 'GET', url: `/viajes/api/trips/${TRIP_ID}/export.gpx`, headers: auth(['invitado']) });
    expect(res.statusCode).toBe(403);
  });

  it('ranks the nearest lodging for a POI', async () => {
    const poi = makePlace({ id: '33333333-3333-4333-8333-333333333333', lat: 39.0, lng: -6.0 });
    const near = makePlace({ type: 'alojamiento', name: 'Near', lat: 39.01, lng: -6.0 });
    const far = makePlace({ type: 'alojamiento', name: 'Far', lat: 38.5, lng: -6.0 });
    vi.mocked(q.getPlace).mockResolvedValue(poi);
    vi.mocked(q.listPlaces).mockResolvedValue([far, near, poi]);
    const res = await app.inject({
      method: 'GET',
      url: `/viajes/api/trips/${TRIP_ID}/places/${poi.id}/nearest-lodging`,
      headers: auth(['admin']),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().lodgings.map((l: { lodging: { name: string } }) => l.lodging.name)).toEqual(['Near', 'Far']);
  });
});
