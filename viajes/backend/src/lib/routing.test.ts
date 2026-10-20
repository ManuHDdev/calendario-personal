import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_BASE_URLS,
  fallbackRoute,
  parseOsrmRoute,
  roadMatrix,
  routeBetween,
  routeCacheKey,
  routeThrough,
  type RouteCache,
  type RouteResult,
  type RoutingConfig,
} from './routing';
import { haversineMeters } from './geo';

const a = { lat: 39.47, lng: -6.34 };
const b = { lat: 39.49, lng: -6.3 };
const c = { lat: 39.5, lng: -6.2 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function memoryCache(): RouteCache & { store: Map<string, RouteResult> } {
  const store = new Map<string, RouteResult>();
  return {
    store,
    get: async (k) => store.get(k) ?? null,
    set: async (k, v) => {
      store.set(k, v);
    },
  };
}

function config(fetchFn: unknown, cache: RouteCache | null = null, timeoutMs = 200): RoutingConfig {
  return { baseUrls: DEFAULT_BASE_URLS, timeoutMs, userAgent: 'test/1.0', fetchFn: fetchFn as typeof fetch, cache };
}

const osrmOk = {
  code: 'Ok',
  routes: [
    {
      legs: [
        { distance: 7110.4, duration: 700.2 },
        { distance: 9000, duration: 800 },
      ],
      geometry: {
        coordinates: [
          [-6.34, 39.47],
          [-6.3, 39.49],
          [-6.2, 39.5],
        ],
      },
    },
  ],
};

describe('parseOsrmRoute', () => {
  it('converts legs and swaps lng,lat into lat,lng', () => {
    const r = parseOsrmRoute(osrmOk, 2)!;
    expect(r.legs).toEqual([
      { distanceM: 7110, durationS: 700 },
      { distanceM: 9000, durationS: 800 },
    ]);
    expect(r.totalDistanceM).toBe(16110);
    expect(r.totalDurationS).toBe(1500);
    expect(r.geometry[0]).toEqual([39.47, -6.34]);
    expect(r.approx).toBe(false);
  });

  it('rejects non-Ok codes, missing routes and leg-count mismatches', () => {
    expect(parseOsrmRoute({ code: 'NoRoute' }, 1)).toBeNull();
    expect(parseOsrmRoute({ code: 'Ok', routes: [] }, 1)).toBeNull();
    expect(parseOsrmRoute(osrmOk, 3)).toBeNull();
    expect(parseOsrmRoute(null, 1)).toBeNull();
    expect(parseOsrmRoute({ code: 'Ok', routes: [{ legs: [{ distance: 'x', duration: 1 }] }] }, 1)).toBeNull();
  });
});

describe('routeThrough', () => {
  it('returns the OSRM result and caches it', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(osrmOk));
    const cache = memoryCache();
    const r = await routeThrough([a, b, c], 'driving', config(fetchFn, cache));
    expect(r.approx).toBe(false);
    expect(r.totalDistanceM).toBe(16110);
    expect(cache.store.size).toBe(1);
    expect(cache.store.has(routeCacheKey([a, b, c], 'driving'))).toBe(true);
  });

  it('serves from cache without calling OSRM', async () => {
    const cache = memoryCache();
    const cached = fallbackRoute([a, b], 'driving');
    cached.approx = false;
    await cache.set(routeCacheKey([a, b], 'driving'), cached);
    const fetchFn = vi.fn();
    const r = await routeThrough([a, b], 'driving', config(fetchFn, cache));
    expect(fetchFn).not.toHaveBeenCalled();
    expect(r).toEqual(cached);
  });

  it('falls back to haversine with approx=true when fetch throws, and does not cache it', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network down');
    });
    const cache = memoryCache();
    const r = await routeThrough([a, b], 'foot', config(fetchFn, cache));
    expect(r.approx).toBe(true);
    expect(r.legs).toHaveLength(1);
    expect(r.legs[0].distanceM).toBe(Math.round(haversineMeters(a, b)));
    expect(r.legs[0].durationS).toBeGreaterThan(0);
    expect(r.geometry).toEqual([
      [a.lat, a.lng],
      [b.lat, b.lng],
    ]);
    expect(cache.store.size).toBe(0);
  });

  it('falls back on HTTP errors (e.g. 429 rate limit)', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ message: 'slow down' }, 429));
    const r = await routeThrough([a, b], 'driving', config(fetchFn));
    expect(r.approx).toBe(true);
  });

  it('falls back when OSRM answers an invalid body', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ code: 'NoRoute' }));
    const r = await routeThrough([a, b], 'driving', config(fetchFn));
    expect(r.approx).toBe(true);
  });

  it('falls back on timeout', async () => {
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    const r = await routeThrough([a, b], 'driving', config(fetchFn, null, 30));
    expect(r.approx).toBe(true);
  });

  it('survives a failing cache', async () => {
    const brokenCache: RouteCache = {
      get: async () => {
        throw new Error('db down');
      },
      set: async () => {
        throw new Error('db down');
      },
    };
    const fetchFn = vi.fn(async () => jsonResponse(osrmOk));
    const r = await routeThrough([a, b, c], 'driving', config(fetchFn, brokenCache));
    expect(r.approx).toBe(false);
  });

  it('uses the per-profile base URL and lng,lat order', async () => {
    const fetchFn = vi.fn(async (_url: string) => jsonResponse(osrmOk));
    await routeThrough([a, b, c], 'foot', config(fetchFn));
    const url = fetchFn.mock.calls[0][0];
    expect(url.startsWith(`${DEFAULT_BASE_URLS.foot}/route/v1/driving/-6.34000,39.47000;`)).toBe(true);
  });

  it('does not call OSRM for fewer than two points', async () => {
    const fetchFn = vi.fn();
    const r = await routeThrough([a], 'driving', config(fetchFn));
    expect(fetchFn).not.toHaveBeenCalled();
    expect(r.legs).toEqual([]);
    expect(r.approx).toBe(false);
  });
});

describe('routeBetween', () => {
  it('reports straight-line and road distance together', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ code: 'Ok', routes: [{ legs: [{ distance: 7110, duration: 700 }], geometry: { coordinates: [] } }] }),
    );
    const r = await routeBetween(a, b, 'driving', config(fetchFn));
    expect(r.distanceM).toBe(7110);
    expect(r.straightM).toBe(Math.round(haversineMeters(a, b)));
    expect(r.straightM).toBeLessThan(r.distanceM);
    expect(r.approx).toBe(false);
  });
});

describe('roadMatrix', () => {
  it('parses an OSRM table response', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        code: 'Ok',
        distances: [
          [0, 7110.4],
          [7307.5, 0],
        ],
        durations: [
          [0, 700],
          [720, 0],
        ],
      }),
    );
    const m = await roadMatrix([a, b], 'driving', config(fetchFn));
    expect(m.approx).toBe(false);
    expect(m.distancesM).toEqual([
      [0, 7110],
      [7308, 0],
    ]);
  });

  it('falls back to haversine on failure or wrong shape', async () => {
    const failing = vi.fn(async () => {
      throw new Error('boom');
    });
    const m1 = await roadMatrix([a, b], 'driving', config(failing));
    expect(m1.approx).toBe(true);
    expect(m1.distancesM[0][1]).toBe(Math.round(haversineMeters(a, b)));

    const wrong = vi.fn(async () => jsonResponse({ code: 'Ok', distances: [[0]], durations: [[0]] }));
    const m2 = await roadMatrix([a, b], 'driving', config(wrong));
    expect(m2.approx).toBe(true);
  });
});
