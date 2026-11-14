import { describe, it, expect, vi } from 'vitest';
import {
  GeocodingError,
  createGeocoder,
  normalizeQuery,
  parseNominatimResults,
  type GeocodeCache,
  type GeocodeHit,
  buildLocality,
  dedupeHits,
  normalizeHit,
  rankHits,
  roundViewbox,
  searchCacheKey,
  USER_AGENT,
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
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ lat: 38.9174665, lng: -6.3443977, displayName: 'Mérida, Badajoz, Extremadura, España', name: 'Mérida', kind: 'otro' });
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
    expect(fetchFn.mock.calls[0][0]).toContain('limit=8');
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

const louvre = {
  lat: '48.8611',
  lon: '2.3364',
  display_name: 'Museo del Louvre, París, Francia',
  category: 'tourism',
  type: 'museum',
  importance: 0.9,
  name: 'Musée du Louvre',
  namedetails: { name: 'Musée du Louvre', 'name:es': 'Museo del Louvre' },
  address: { museum: 'Museo del Louvre', city: 'París', country: 'Francia' },
};

describe('parseNominatimResults with addressdetails', () => {
  it('extracts name, locality, raw class/type, kind and label', () => {
    const [hit] = parseNominatimResults([louvre]);
    expect(hit).toMatchObject({
      name: 'Museo del Louvre',
      locality: 'París, Francia',
      category: 'tourism',
      type: 'museum',
      kind: 'interes',
      kindLabel: 'Museo',
      admin: false,
      importance: 0.9,
    });
  });

  it('falls back to item.name and then the first display_name segment', () => {
    const [a] = parseNominatimResults([{ ...louvre, namedetails: undefined }]);
    expect(a.name).toBe('Musée du Louvre');
    const [b] = parseNominatimResults([{ ...louvre, namedetails: undefined, name: '' }]);
    expect(b.name).toBe('Museo del Louvre');
  });

  it('uses the region when the hit itself is the settlement', () => {
    expect(buildLocality({ city: 'Versalles', state: 'Isla de Francia', country: 'Francia' }, 'Versalles')).toBe(
      'Isla de Francia, Francia',
    );
    expect(buildLocality(undefined, 'x')).toBeUndefined();
  });
});

describe('normalizeHit (legacy cached rows)', () => {
  it('derives name and kind for rows with only the three old fields', () => {
    const old: GeocodeHit = { lat: 1, lng: 2, displayName: 'Plaza Mayor, Madrid, España' };
    expect(normalizeHit(old)).toEqual({ ...old, name: 'Plaza Mayor', kind: 'otro' });
  });

  it('is applied to cache hits', async () => {
    const old: GeocodeHit = { lat: 1, lng: 2, displayName: 'Plaza Mayor, Madrid' };
    const fetchFn = vi.fn();
    const { geocoder } = makeGeocoder(fetchFn, { get: async () => [old], set: async () => undefined });
    const [hit] = await geocoder.search('plaza mayor');
    expect(hit.name).toBe('Plaza Mayor');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('dedupeHits', () => {
  const h = (name: string, lat: number, lng: number): GeocodeHit => ({ lat, lng, displayName: name, name });
  it('drops same-name hits within ~150 m but keeps distant ones', () => {
    const out = dedupeHits([h('Louvre', 48.86, 2.33), h('louvre', 48.8605, 2.3305), h('Louvre', 40.0, -3.0), h('Otro', 48.86, 2.33)]);
    expect(out.map((x) => x.name)).toEqual(['Louvre', 'Louvre', 'Otro']);
    expect(out[1].lat).toBe(40.0);
  });
});

describe('rankHits', () => {
  const town: GeocodeHit = { lat: 1, lng: 1, displayName: 'Versalles', name: 'Versalles', admin: true, importance: 0.7 };
  const palace: GeocodeHit = { lat: 1, lng: 1.1, displayName: 'Palacio', name: 'Palacio de Versalles', admin: false, importance: 0.65 };
  const bar: GeocodeHit = { lat: 1, lng: 1.2, displayName: 'Bar', name: 'Bar Central', admin: false, importance: 0.1 };

  it('promotes a relevant POI above the administrative area without dropping the area', () => {
    const out = rankHits([town, bar, palace], 'versalles');
    expect(out.map((h) => h.name)).toEqual(['Palacio de Versalles', 'Versalles', 'Bar Central']);
  });

  it('keeps a city search intact when no POI is relevant', () => {
    expect(rankHits([town, bar], 'versailles').map((h) => h.name)).toEqual(['Versalles', 'Bar Central']);
  });

  it('leaves order untouched without administrative hits', () => {
    expect(rankHits([palace, bar], 'x')).toEqual([palace, bar]);
  });
});

describe('viewbox bias and cache key', () => {
  it('rounds outwards to 0.1 degree', () => {
    expect(roundViewbox({ west: 2.21, north: 48.93, east: 2.46, south: 48.81 })).toEqual({ west: 2.2, north: 49, east: 2.5, south: 48.8 });
  });

  it('shares a key for nearby viewboxes and separates biased from unbiased', () => {
    const a = searchCacheKey('Versailles', { viewbox: { west: 2.21, north: 48.93, east: 2.46, south: 48.81 } });
    const b = searchCacheKey(' versailles ', { viewbox: { west: 2.22, north: 48.92, east: 2.45, south: 48.82 } });
    expect(a).toBe(b);
    expect(a).not.toBe(searchCacheKey('versailles'));
    expect(searchCacheKey('x', { countrycodes: ['fr', 'es'] })).toBe(searchCacheKey('x', { countrycodes: ['es', 'fr'] }));
  });

  it('sends viewbox in left,top,right,bottom order with bounded=0 and countrycodes', async () => {
    const fetchFn = vi.fn(async (_u: string, _i?: RequestInit) => jsonResponse([louvre]));
    const { geocoder } = makeGeocoder(fetchFn);
    await geocoder.search('louvre', { viewbox: { west: 2.21, north: 48.93, east: 2.46, south: 48.81 }, countrycodes: ['fr'] });
    const url = new URL(fetchFn.mock.calls[0][0]);
    expect(url.searchParams.get('viewbox')).toBe('2.2,49,2.5,48.8');
    expect(url.searchParams.get('bounded')).toBe('0');
    expect(url.searchParams.get('countrycodes')).toBe('fr');
    expect(url.searchParams.get('addressdetails')).toBe('1');
    expect(url.searchParams.get('namedetails')).toBe('1');
  });

  it('never puts an email address in the User-Agent', () => {
    expect(USER_AGENT).not.toMatch(/@/);
  });
});
