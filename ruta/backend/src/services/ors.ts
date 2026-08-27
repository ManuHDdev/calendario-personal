/**
 * OpenRouteService driving-route client.
 *
 * The sibling `paraisos` subapp already calls ORS for point-to-point distance;
 * this one needs the same call but keeps the FULL geometry rather than just
 * the summary, because the polyline is what the corridor is built around.
 *
 * Free-plan limits at the time of writing: 2500 requests/day, 40/minute. The
 * self-imposed daily cap below sits under that so we fail with a clear 503
 * instead of getting the shared API key throttled.
 */

import type { LatLng } from './geo';

const DIRECTIONS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';

export class RouteError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 502,
  ) {
    super(message);
    this.name = 'RouteError';
  }
}

export interface DrivingRoute {
  /** Full route geometry in travel order. */
  polyline: LatLng[];
  distanceKm: number;
  durationMin: number;
}

/** Self-imposed daily cap, below the real free-plan ceiling. */
const DAILY_CAP = 2000;
let dailyCount = 0;
let dailyResetDate = new Date().toISOString().slice(0, 10);

function underDailyCap(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyResetDate) {
    dailyResetDate = today;
    dailyCount = 0;
  }
  return dailyCount < DAILY_CAP;
}

/** Cached routes, keyed on coordinates rounded to ~100 m. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { route: DrivingRoute; expires: number }>();

function cacheKey(from: LatLng, to: LatLng): string {
  const r = (n: number) => n.toFixed(3);
  return `${r(from.lat)},${r(from.lng)}|${r(to.lat)},${r(to.lng)}`;
}

interface OrsGeoJson {
  features?: Array<{
    geometry?: { coordinates?: unknown };
    properties?: { summary?: { distance?: unknown; duration?: unknown } };
  }>;
}

/**
 * Fetches the driving route between two points.
 *
 * @throws RouteError with a 503 when ORS is unconfigured or the daily cap is
 *         spent, and a 502 when ORS itself fails or answers unexpectedly.
 */
export async function getDrivingRoute(
  from: LatLng,
  to: LatLng,
  timeoutMs = 20_000,
): Promise<DrivingRoute> {
  const key = cacheKey(from, to);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.route;

  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    throw new RouteError('El servicio de rutas no esta configurado (falta ORS_API_KEY)', 503);
  }
  if (!underDailyCap()) {
    throw new RouteError('Limite diario de calculo de rutas alcanzado; disponible manana', 503);
  }

  const url =
    `${DIRECTIONS_URL}?api_key=${encodeURIComponent(apiKey)}` +
    `&start=${from.lng},${from.lat}&end=${to.lng},${to.lat}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    dailyCount++;

    if (!res.ok) {
      // 404 from ORS means "no drivable route", which is a user-facing fact
      // rather than an outage -- worth saying so instead of a generic error.
      if (res.status === 404) {
        throw new RouteError('No existe una ruta por carretera entre esos dos puntos', 422);
      }
      throw new RouteError(`No se pudo calcular la ruta (ORS respondio ${res.status})`);
    }

    const body = (await res.json()) as OrsGeoJson;
    const feature = body.features?.[0];
    const coordinates = feature?.geometry?.coordinates;
    const distance = feature?.properties?.summary?.distance;
    const duration = feature?.properties?.summary?.duration;

    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      throw new RouteError('ORS devolvio una ruta sin geometria');
    }

    // ORS emits [lng, lat] pairs; the rest of this codebase uses { lat, lng }.
    const polyline: LatLng[] = [];
    for (const pair of coordinates) {
      if (!Array.isArray(pair) || typeof pair[0] !== 'number' || typeof pair[1] !== 'number') {
        continue;
      }
      polyline.push({ lat: pair[1], lng: pair[0] });
    }

    if (polyline.length < 2) {
      throw new RouteError('ORS devolvio una geometria de ruta inutilizable');
    }

    const route: DrivingRoute = {
      polyline,
      distanceKm:
        typeof distance === 'number' ? Math.round((distance / 1000) * 10) / 10 : 0,
      durationMin: typeof duration === 'number' ? Math.round(duration / 60) : 0,
    };

    cache.set(key, { route, expires: Date.now() + CACHE_TTL_MS });
    return route;
  } catch (err) {
    if (err instanceof RouteError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new RouteError(`El servicio de rutas no respondio en ${timeoutMs} ms`);
    }
    throw new RouteError(
      `No se pudo calcular la ruta: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
