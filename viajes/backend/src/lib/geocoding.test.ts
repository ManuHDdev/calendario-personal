import { describe, it, expect, vi } from 'vitest';
import {
  GeocodingError,
  createGeocoder,
  normalizeQuery,
  parseNominatimResults,
  type GeocodeCache,
  type GeocodeHit,
} from './geocoding';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const merida = [{ lat: '38.9174665', lon: '-6.3443977', display_name: 'Mérida, Badajoz, Extremadura, España' }];

function makeGeocoder(fetchFn: unknown, cache: GeocodeCache | null = null) {
  let clock = 1_000_000;
  const sleeps: number[] = [];
  const geocoder = createGeocoder({
    fetchFn: fetchFn as typeof fetch,
    cache,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
    timeoutMs: 100,
  });
  return { geocoder, sleeps };
}

describe('parseNominatimResults', () => {
  it('maps lat/lon strings to numbers and drops unusable items', () => {
    const hits = parseNominatimResults([...merida, { lat: 'x', lon: '1' }, {}]);
    expect(hits).toEqual([{ lat: 38.9174665, lng: -6.3443977, displayName: 'Mérida, Badajoz, Extremadura, España' }]);
  });

  it('accepts a single object (reverse geocoding) and garbage', () => {
    expect(parseNominatimResults(merida[0])).toHaveLength(1);
    expect(parseNominatimResults(null)).toEqual([]);
    expect(parseNominatimResults('nope')).toEqual([]);
  });
});

describe('normalizeQuery', () => {
  it('trims, lowercases and collapses whitespace', () => {
    expect(normalizeQuery('  Plaza   de  ESPAÑA ')).toBe('plaza de españa');
  });
});

describe('createGeocoder', () => {
  it('searches with a User-Agent and caches non-empty answers', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(merida));
    const store = new Map<string, GeocodeHit[]>();
    const cache: GeocodeCache = {
      get: async (k) => store.get(k) ?? null,
      set: async (k, v) => {
        store.set(k, v);
      },
    };
    const { geocoder } = makeGeocoder(fetchFn, cache);

    const first = await geocoder.search('Mérida');
    const second = await geocoder.search('  mérida ');
    expect(first).toEqual(second);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const headers = fetchFn.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['User-Agent']).toContain('ElBunkerDelIngeniero-Viajes');
    expect(fetchFn.mock.calls[0][0]).toContain('limit=5');
  });

  it('does not cache empty results', async () => {
    const fetchFn = vi.fn(async () => jsonResponse([]));
    const set = vi.fn();
    const { geocoder } = makeGeocoder(fetchFn, { get: async () => null, set });
    expect(await geocoder.search('zzzz nowhere')).toEqual([]);
    expect(set).not.toHaveBeenCalled();
  });

  it('keeps at least the minimum interval between consecutive upstream requests', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(merida));
    const { geocoder, sleeps } = makeGeocoder(fetchFn);
    await Promise.all([geocoder.search('uno'), geocoder.search('dos'), geocoder.search('tres')]);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    // First call goes straight through, the other two wait the politeness interval.
    expect(sleeps.length).toBe(2);
    expect(sleeps.every((ms) => ms >= 1000)).toBe(true);
  });

  it('maps upstream failures to GeocodingError and keeps working afterwards', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse(merida));
    const { geocoder } = makeGeocoder(fetchFn);
    await expect(geocoder.search('fallo')).rejects.toBeInstanceOf(GeocodingError);
    await expect(geocoder.search('bien')).resolves.toHaveLength(1);
  });

  it('times out slow upstream responses', async () => {
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    const { geocoder } = makeGeocoder(fetchFn);
    await expect(geocoder.search('lento')).rejects.toThrow(/did not answer/);
  });

  it('rejects an empty query with a 400', () => {
    const { geocoder } = makeGeocoder(vi.fn());
    expect(() => geocoder.search('   ')).toThrowError(GeocodingError);
  });

  it('reverse geocodes and returns [] when Nominatim reports an error object', async () => {
    const ok = vi.fn(async () => jsonResponse(merida[0]));
    expect(await makeGeocoder(ok).geocoder.reverse(38.9, -6.3)).toHaveLength(1);
    const none = vi.fn(async () => jsonResponse({ error: 'Unable to geocode' }));
    expect(await makeGeocoder(none).geocoder.reverse(0, 0)).toEqual([]);
  });
});
