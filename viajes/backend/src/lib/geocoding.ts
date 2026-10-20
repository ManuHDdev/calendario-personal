/**
 * Address search / reverse geocoding through OpenStreetMap's Nominatim.
 *
 * Nominatim's usage policy: at most 1 request per second and a real
 * identifying User-Agent. Both are honoured here, and every distinct query is
 * cached (Postgres, injected) so a place is looked up at most once.
 */

export interface GeocodeHit {
  lat: number;
  lng: number;
  displayName: string;
}

export class GeocodingError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 502,
  ) {
    super(message);
    this.name = 'GeocodingError';
  }
}

export interface GeocodeCache {
  get(key: string): Promise<GeocodeHit[] | null>;
  set(key: string, value: GeocodeHit[]): Promise<void>;
}

export interface GeocoderDeps {
  fetchFn: typeof fetch;
  cache: GeocodeCache | null;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  baseUrl?: string;
  userAgent?: string;
  minIntervalMs?: number;
  timeoutMs?: number;
}

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
export const USER_AGENT = 'ElBunkerDelIngeniero-Viajes/1.0 (https://elbunkerdelingeniero.duckdns.org/viajes/)';

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

interface NominatimItem {
  lat?: unknown;
  lon?: unknown;
  display_name?: unknown;
}

/** Converts Nominatim items to hits, dropping anything without usable coordinates. */
export function parseNominatimResults(body: unknown): GeocodeHit[] {
  const items: NominatimItem[] = Array.isArray(body) ? (body as NominatimItem[]) : body ? [body as NominatimItem] : [];
  const hits: GeocodeHit[] = [];
  for (const item of items) {
    const lat = Number(item?.lat);
    const lng = Number(item?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    hits.push({
      lat,
      lng,
      displayName: typeof item.display_name === 'string' ? item.display_name : `${lat}, ${lng}`,
    });
  }
  return hits;
}

export function createGeocoder(deps: GeocoderDeps) {
  const baseUrl = deps.baseUrl ?? NOMINATIM_URL;
  const userAgent = deps.userAgent ?? USER_AGENT;
  const minInterval = deps.minIntervalMs ?? 1100;
  const timeoutMs = deps.timeoutMs ?? 15_000;

  let lastRequestAt = 0;
  /** Serialises callers so concurrent searches cannot burst past the rate limit. */
  let chain: Promise<unknown> = Promise.resolve();

  async function request(path: string): Promise<unknown> {
    const run = chain.then(async () => {
      const wait = minInterval - (deps.now() - lastRequestAt);
      if (wait > 0) await deps.sleep(wait);
      lastRequestAt = deps.now();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await deps.fetchFn(`${baseUrl}${path}`, {
          signal: controller.signal,
          headers: { 'User-Agent': userAgent, Accept: 'application/json', 'Accept-Language': 'es' },
        });
        if (!res.ok) throw new GeocodingError(`Geocoder answered ${res.status}`);
        return await res.json();
      } catch (err) {
        if (err instanceof GeocodingError) throw err;
        if (err instanceof Error && err.name === 'AbortError') {
          throw new GeocodingError(`Geocoder did not answer within ${timeoutMs} ms`);
        }
        throw new GeocodingError(`Geocoding failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        clearTimeout(timer);
      }
    });
    // One failed lookup must not wedge every later one.
    chain = run.catch(() => undefined);
    return run;
  }

  async function cached(key: string, load: () => Promise<GeocodeHit[]>): Promise<GeocodeHit[]> {
    if (deps.cache) {
      const hit = await deps.cache.get(key).catch(() => null);
      if (hit) return hit;
    }
    const value = await load();
    // Empty results are not cached: the place may simply be typed wrong.
    if (deps.cache && value.length > 0) await deps.cache.set(key, value).catch(() => undefined);
    return value;
  }

  return {
    search(query: string): Promise<GeocodeHit[]> {
      const key = normalizeQuery(query);
      if (!key) throw new GeocodingError('Empty search', 400);
      return cached(`s:${key}`, async () => {
        const params = new URLSearchParams({ q: key, format: 'jsonv2', limit: '5', addressdetails: '0' });
        return parseNominatimResults(await request(`/search?${params.toString()}`));
      });
    },

    reverse(lat: number, lng: number): Promise<GeocodeHit[]> {
      const key = `r:${lat.toFixed(5)},${lng.toFixed(5)}`;
      return cached(key, async () => {
        const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'jsonv2', zoom: '18' });
        const body = (await request(`/reverse?${params.toString()}`)) as { error?: unknown } | null;
        if (body && 'error' in body) return [];
        return parseNominatimResults(body);
      });
    },
  };
}

export type Geocoder = ReturnType<typeof createGeocoder>;
