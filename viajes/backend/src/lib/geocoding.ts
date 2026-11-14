/**
 * Address search / reverse geocoding through OpenStreetMap's Nominatim.
 *
 * Nominatim's usage policy: at most 1 request per second and a real
 * identifying User-Agent. Both are honoured here, and every distinct query is
 * cached (Postgres, injected) so a place is looked up at most once.
 */

import { classifyPlace } from './placeKind';
import type { PlaceType } from './types';

export interface GeocodeHit {
  lat: number;
  lng: number;
  displayName: string;
  /** The place's own name ("Museo del Louvre"). Always set on fresh hits; derived for legacy cached rows. */
  name?: string;
  /** Short "city, country" context shown under the name. */
  locality?: string;
  /** Raw OSM class/type (e.g. tourism / museum). */
  category?: string;
  type?: string;
  /** Normalized app place type. */
  kind?: PlaceType;
  /** Spanish label of the OSM feature type ("Museo"). */
  kindLabel?: string;
  /** Nominatim ranking weight, only used to order hits. */
  importance?: number;
  /** True for settlements/administrative areas. */
  admin?: boolean;
}

/** Optional geographic bias for a search. */
export interface SearchBias {
  viewbox?: { west: number; north: number; east: number; south: number };
  countrycodes?: string[];
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
  name?: unknown;
  category?: unknown;
  class?: unknown;
  type?: unknown;
  addresstype?: unknown;
  importance?: unknown;
  address?: Record<string, unknown>;
  namedetails?: Record<string, unknown>;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

const firstSegment = (displayName: string): string => displayName.split(',')[0].trim();

/** "Versalles, Francia": nearest settlement + country (or region when the hit IS the settlement). */
export function buildLocality(address: Record<string, unknown> | undefined, name: string): string | undefined {
  if (!address) return undefined;
  const pick = (...keys: string[]) => keys.map((k) => str(address[k])).find((v) => v && v !== name);
  const place = pick('city', 'town', 'village', 'municipality', 'hamlet', 'suburb', 'city_district');
  const region = place ? undefined : pick('state', 'region', 'county', 'province');
  const country = str(address.country);
  const parts = [place ?? region, country].filter((p, i, arr): p is string => !!p && arr.indexOf(p) === i);
  return parts.length ? parts.join(', ') : undefined;
}

/** Fills the enriched fields of hits cached before they existed (only lat/lng/displayName). */
export function normalizeHit(hit: GeocodeHit): GeocodeHit {
  return { ...hit, name: hit.name ?? firstSegment(hit.displayName), kind: hit.kind ?? 'otro' };
}

/** Converts Nominatim items to hits, dropping anything without usable coordinates. */
export function parseNominatimResults(body: unknown): GeocodeHit[] {
  const items: NominatimItem[] = Array.isArray(body) ? (body as NominatimItem[]) : body ? [body as NominatimItem] : [];
  const hits: GeocodeHit[] = [];
  for (const item of items) {
    const lat = Number(item?.lat);
    const lng = Number(item?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const displayName = typeof item.display_name === 'string' ? item.display_name : `${lat}, ${lng}`;
    const category = str(item.category) ?? str(item.class);
    const type = str(item.type);
    const c = classifyPlace(category, type, str(item.addresstype));
    const name =
      str(item.namedetails?.['name:es']) ?? str(item.name) ?? str(item.namedetails?.name) ?? firstSegment(displayName);
    const importance = Number(item.importance);
    const hit: GeocodeHit = { lat, lng, displayName, name, kind: c.kind, kindLabel: c.label, admin: c.admin };
    if (category) hit.category = category;
    if (type) hit.type = type;
    const locality = buildLocality(item.address, name);
    if (locality) hit.locality = locality;
    if (item.importance != null && Number.isFinite(importance)) hit.importance = importance;
    hits.push(hit);
  }
  return hits;
}

const EARTH_RADIUS_M = 6_371_000;

function distanceM(a: GeocodeHit, b: GeocodeHit): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

const DEDUPE_RADIUS_M = 150;

/** Drops hits with the same name within ~150 m of an earlier (better ranked) one. */
export function dedupeHits(hits: GeocodeHit[]): GeocodeHit[] {
  const kept: GeocodeHit[] = [];
  for (const hit of hits) {
    const key = normalizeQuery(hit.name ?? hit.displayName);
    const dup = kept.some((k) => normalizeQuery(k.name ?? k.displayName) === key && distanceM(k, hit) <= DEDUPE_RADIUS_M);
    if (!dup) kept.push(hit);
  }
  return kept;
}

/**
 * Puts points of interest ahead of administrative areas when they are about as
 * relevant (Nominatim importance >= 60% of the area's) or their name contains
 * the query. Areas are never dropped: a city search must still find the city.
 */
export function rankHits(hits: GeocodeHit[], query: string): GeocodeHit[] {
  const q = normalizeQuery(query);
  const adminTop = hits.filter((h) => h.admin).reduce((m, h) => Math.max(m, h.importance ?? 0), 0);
  const relevantPoi = (h: GeocodeHit) =>
    !h.admin && ((h.importance ?? 0) >= adminTop * 0.6 || normalizeQuery(h.name ?? '').includes(q));
  const firstAdmin = hits.findIndex((h) => h.admin);
  if (firstAdmin < 0) return hits;
  const promoted = hits.filter((h, i) => i > firstAdmin && relevantPoi(h));
  if (promoted.length === 0) return hits;
  const rest = hits.filter((h) => !promoted.includes(h));
  const at = rest.findIndex((h) => h.admin);
  return [...rest.slice(0, at), ...promoted, ...rest.slice(at)];
}

/** Rounds the viewbox outwards to 0.1 degree so nearby map positions share a cache entry. */
export function roundViewbox(vb: NonNullable<SearchBias['viewbox']>) {
  const down = (n: number) => Math.floor(n * 10 + 1e-9) / 10;
  const up = (n: number) => Math.ceil(n * 10 - 1e-9) / 10;
  return { west: down(vb.west), north: up(vb.north), east: up(vb.east), south: down(vb.south) };
}

export function searchCacheKey(query: string, bias?: SearchBias): string {
  let key = `s2:${normalizeQuery(query)}`;
  if (bias?.viewbox) {
    const v = roundViewbox(bias.viewbox);
    key += `|vb:${v.west.toFixed(1)},${v.north.toFixed(1)},${v.east.toFixed(1)},${v.south.toFixed(1)}`;
  }
  if (bias?.countrycodes?.length) key += `|cc:${[...bias.countrycodes].sort().join(',')}`;
  return key;
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
      if (hit) return hit.map(normalizeHit);
    }
    const value = await load();
    // Empty results are not cached: the place may simply be typed wrong.
    if (deps.cache && value.length > 0) await deps.cache.set(key, value).catch(() => undefined);
    return value;
  }

  return {
    search(query: string, bias?: SearchBias): Promise<GeocodeHit[]> {
      const key = normalizeQuery(query);
      if (!key) throw new GeocodingError('Empty search', 400);
      return cached(searchCacheKey(query, bias), async () => {
        const params = new URLSearchParams({
          q: key,
          format: 'jsonv2',
          limit: '8',
          addressdetails: '1',
          namedetails: '1',
        });
        if (bias?.viewbox) {
          const v = roundViewbox(bias.viewbox);
          // Nominatim order: left,top,right,bottom. bounded=0 only boosts, never excludes.
          params.set('viewbox', `${v.west},${v.north},${v.east},${v.south}`);
          params.set('bounded', '0');
        }
        if (bias?.countrycodes?.length) params.set('countrycodes', bias.countrycodes.join(','));
        const hits = parseNominatimResults(await request(`/search?${params.toString()}`));
        return rankHits(dedupeHits(hits), key);
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
