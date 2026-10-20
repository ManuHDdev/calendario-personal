import { estimateDurationSeconds, haversineMeters, haversineMatrix, type LatLng, type Profile } from './geo';

/**
 * Road distance/duration through OSRM, with a Postgres-backed cache (injected,
 * so it is testable) and a graceful fallback to straight-line distance.
 *
 * Whenever OSRM fails, times out or answers something unusable, the result is
 * computed from haversine and flagged `approx: true` so the UI can show "~".
 * Approximate results are NEVER cached (they would hide a later working OSRM).
 */

export interface RouteLeg {
  distanceM: number;
  durationS: number;
}

export interface RouteResult {
  legs: RouteLeg[];
  totalDistanceM: number;
  totalDurationS: number;
  /** Polyline as [lat, lng] pairs, ready for Leaflet. */
  geometry: Array<[number, number]>;
  approx: boolean;
}

export interface MatrixResult {
  distancesM: number[][];
  durationsS: number[][];
  approx: boolean;
}

export interface RouteCache {
  get(key: string): Promise<RouteResult | null>;
  set(key: string, value: RouteResult): Promise<void>;
}

export interface RoutingConfig {
  /**
   * Base URL per profile, WITHOUT `/route/v1/...`. The public OSRM demo server
   * (router.project-osrm.org) ignores the profile segment and always routes
   * by car, so foot/bike default to the FOSSGIS OSRM instances instead.
   */
  baseUrls: Record<Profile, string>;
  timeoutMs: number;
  userAgent: string;
  fetchFn: typeof fetch;
  cache: RouteCache | null;
}

export const DEFAULT_BASE_URLS: Record<Profile, string> = {
  driving: 'https://router.project-osrm.org',
  foot: 'https://routing.openstreetmap.de/routed-foot',
  bike: 'https://routing.openstreetmap.de/routed-bike',
};

export function defaultRoutingConfig(cache: RouteCache | null): RoutingConfig {
  return {
    baseUrls: {
      driving: process.env.OSRM_URL_DRIVING || DEFAULT_BASE_URLS.driving,
      foot: process.env.OSRM_URL_FOOT || DEFAULT_BASE_URLS.foot,
      bike: process.env.OSRM_URL_BIKE || DEFAULT_BASE_URLS.bike,
    },
    timeoutMs: Number(process.env.OSRM_TIMEOUT_MS) || 6000,
    userAgent: 'ElBunkerDelIngeniero-Viajes/1.0 (https://elbunkerdelingeniero.duckdns.org/viajes/)',
    fetchFn: fetch,
    cache,
  };
}

/** Coordinates rounded to ~1 m so near-identical clicks share a cache entry. */
function fmt(n: number): string {
  return n.toFixed(5);
}

export function routeCacheKey(points: LatLng[], profile: Profile): string {
  return `${profile}|${points.map((p) => `${fmt(p.lat)},${fmt(p.lng)}`).join(';')}`;
}

/** OSRM wants `lng,lat` pairs joined by `;`. */
function osrmCoords(points: LatLng[]): string {
  return points.map((p) => `${fmt(p.lng)},${fmt(p.lat)}`).join(';');
}

/** Straight-line route through the points, used when OSRM is unavailable. */
export function fallbackRoute(points: LatLng[], profile: Profile): RouteResult {
  const legs: RouteLeg[] = [];
  for (let i = 1; i < points.length; i++) {
    const distanceM = Math.round(haversineMeters(points[i - 1], points[i]));
    legs.push({ distanceM, durationS: estimateDurationSeconds(distanceM, profile) });
  }
  return {
    legs,
    totalDistanceM: legs.reduce((s, l) => s + l.distanceM, 0),
    totalDurationS: legs.reduce((s, l) => s + l.durationS, 0),
    geometry: points.map((p) => [p.lat, p.lng] as [number, number]),
    approx: true,
  };
}

async function fetchJson(url: string, cfg: RoutingConfig): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await cfg.fetchFn(url, {
      signal: controller.signal,
      headers: { 'User-Agent': cfg.userAgent, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`OSRM answered ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

interface OsrmRouteResponse {
  code?: string;
  routes?: Array<{
    legs?: Array<{ distance?: number; duration?: number }>;
    geometry?: { coordinates?: Array<[number, number]> };
  }>;
}

/** Validates and converts an OSRM /route response, or returns null if unusable. */
export function parseOsrmRoute(body: unknown, expectedLegs: number): RouteResult | null {
  const data = body as OsrmRouteResponse | null;
  if (!data || data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) return null;
  const route = data.routes[0];
  if (!Array.isArray(route.legs) || route.legs.length !== expectedLegs) return null;

  const legs: RouteLeg[] = [];
  for (const leg of route.legs) {
    if (typeof leg.distance !== 'number' || typeof leg.duration !== 'number') return null;
    legs.push({ distanceM: Math.round(leg.distance), durationS: Math.round(leg.duration) });
  }
  const coords = route.geometry?.coordinates;
  const geometry: Array<[number, number]> = Array.isArray(coords)
    ? coords.map(([lng, lat]) => [lat, lng] as [number, number])
    : [];

  return {
    legs,
    totalDistanceM: legs.reduce((s, l) => s + l.distanceM, 0),
    totalDurationS: legs.reduce((s, l) => s + l.durationS, 0),
    geometry,
    approx: false,
  };
}

/**
 * Route through an ordered list of 2+ points. One OSRM request returns every
 * leg, so a whole day costs a single call.
 */
export async function routeThrough(
  points: LatLng[],
  profile: Profile,
  cfg: RoutingConfig,
): Promise<RouteResult> {
  if (points.length < 2) {
    return {
      legs: [],
      totalDistanceM: 0,
      totalDurationS: 0,
      geometry: points.map((p) => [p.lat, p.lng] as [number, number]),
      approx: false,
    };
  }

  const key = routeCacheKey(points, profile);
  if (cfg.cache) {
    const hit = await cfg.cache.get(key).catch(() => null);
    if (hit) return hit;
  }

  try {
    const url =
      `${cfg.baseUrls[profile]}/route/v1/driving/${osrmCoords(points)}` +
      `?overview=full&geometries=geojson&steps=false`;
    const parsed = parseOsrmRoute(await fetchJson(url, cfg), points.length - 1);
    if (!parsed) return fallbackRoute(points, profile);
    if (cfg.cache) await cfg.cache.set(key, parsed).catch(() => undefined);
    return parsed;
  } catch {
    return fallbackRoute(points, profile);
  }
}

/** Convenience wrapper: distance and duration between exactly two points. */
export async function routeBetween(
  from: LatLng,
  to: LatLng,
  profile: Profile,
  cfg: RoutingConfig,
): Promise<{ distanceM: number; durationS: number; straightM: number; approx: boolean; geometry: Array<[number, number]> }> {
  const result = await routeThrough([from, to], profile, cfg);
  return {
    distanceM: result.totalDistanceM,
    durationS: result.totalDurationS,
    straightM: Math.round(haversineMeters(from, to)),
    approx: result.approx,
    geometry: result.geometry,
  };
}

interface OsrmTableResponse {
  code?: string;
  distances?: unknown;
  durations?: unknown;
}

/** Road distance matrix via OSRM's /table service (one request), with haversine fallback. */
export async function roadMatrix(points: LatLng[], profile: Profile, cfg: RoutingConfig): Promise<MatrixResult> {
  const fallback = (): MatrixResult => {
    const distancesM = haversineMatrix(points);
    return {
      distancesM,
      durationsS: distancesM.map((row) => row.map((d) => estimateDurationSeconds(d, profile))),
      approx: true,
    };
  };
  if (points.length < 2) {
    return { distancesM: haversineMatrix(points), durationsS: points.map(() => [0]), approx: false };
  }

  try {
    const url = `${cfg.baseUrls[profile]}/table/v1/driving/${osrmCoords(points)}?annotations=distance,duration`;
    const body = (await fetchJson(url, cfg)) as OsrmTableResponse | null;
    const n = points.length;
    const valid = (m: unknown): m is number[][] =>
      Array.isArray(m) &&
      m.length === n &&
      m.every((r) => Array.isArray(r) && r.length === n && r.every((v) => typeof v === 'number'));
    if (body?.code !== 'Ok' || !valid(body.distances) || !valid(body.durations)) return fallback();
    return {
      distancesM: body.distances.map((r) => r.map((v) => Math.round(v))),
      durationsS: body.durations.map((r) => r.map((v) => Math.round(v))),
      approx: false,
    };
  } catch {
    return fallback();
  }
}
