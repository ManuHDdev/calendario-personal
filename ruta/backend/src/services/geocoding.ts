/**
 * Place name -> coordinates, via OpenStreetMap's Nominatim.
 *
 * Nobody types "38.9167, -5.6667" when they mean La Coronada, so the origin
 * and destination fields take free text and are resolved here.
 *
 * Nominatim is a free, shared, donation-funded service with a firm usage
 * policy: at most one request per second, and a real identifying User-Agent.
 * Both are honoured below, and every distinct query is cached in Postgres so a
 * given place is only ever looked up once, no matter how often it is searched.
 */

import { pool } from '../db/pool';
import type { LatLng } from './geo';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

/** Identifies this app to Nominatim, as their usage policy requires. */
const USER_AGENT =
  'ElBunkerDelIngeniero-Ruta/1.0 (https://elbunkerdelingeniero.duckdns.org/ruta/)';

export class GeocodingError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 502,
  ) {
    super(message);
    this.name = 'GeocodingError';
  }
}

export interface GeocodeResult extends LatLng {
  /** Full name as Nominatim resolved it, so the user can confirm the match. */
  displayName: string;
}

/** Nominatim asks for no more than one request per second. */
const MIN_REQUEST_INTERVAL_MS = 1100;
let lastRequestAt = 0;
/** Serialises callers so concurrent searches cannot burst past the limit. */
let requestChain: Promise<unknown> = Promise.resolve();

function normalise(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function readCache(key: string): Promise<GeocodeResult | null> {
  const result = await pool.query<{ latitud: string; longitud: string; display_name: string }>(
    'SELECT latitud, longitud, display_name FROM geocode_cache WHERE consulta = $1',
    [key],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    lat: Number(row.latitud),
    lng: Number(row.longitud),
    displayName: row.display_name,
  };
}

async function writeCache(key: string, value: GeocodeResult): Promise<void> {
  await pool.query(
    `INSERT INTO geocode_cache (consulta, latitud, longitud, display_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (consulta) DO UPDATE
       SET latitud = EXCLUDED.latitud,
           longitud = EXCLUDED.longitud,
           display_name = EXCLUDED.display_name`,
    [key, value.lat, value.lng, value.displayName],
  );
}

/**
 * Resolves a free-text place to coordinates.
 *
 * @throws GeocodingError with 404 when the place simply is not found, which is
 *         a normal user outcome rather than a failure of the service.
 */
export async function geocode(query: string): Promise<GeocodeResult> {
  const key = normalise(query);
  if (!key) throw new GeocodingError('La busqueda de lugar esta vacia', 400);

  const cached = await readCache(key).catch(() => null);
  if (cached) return cached;

  // Queue behind any in-flight lookup, then wait out the rate limit.
  const run = requestChain.then(async () => {
    const wait = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return fetchFromNominatim(key);
  });
  // Keep the chain alive even when this lookup fails, so one bad query does
  // not wedge every later one.
  requestChain = run.catch(() => undefined);

  const resolved = await run;
  await writeCache(key, resolved).catch(() => undefined);
  return resolved;
}

async function fetchFromNominatim(query: string, timeoutMs = 15_000): Promise<GeocodeResult> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    addressdetails: '0',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'Accept-Language': 'es',
      },
    });

    if (!res.ok) {
      throw new GeocodingError(`El geocodificador respondio ${res.status}`);
    }

    const body = (await res.json()) as Array<{
      lat?: unknown;
      lon?: unknown;
      display_name?: unknown;
    }>;

    const hit = Array.isArray(body) ? body[0] : undefined;
    const lat = hit ? Number(hit.lat) : NaN;
    const lng = hit ? Number(hit.lon) : NaN;

    if (!hit || Number.isNaN(lat) || Number.isNaN(lng)) {
      throw new GeocodingError(`No se encontro ningun lugar llamado "${query}"`, 404);
    }

    return {
      lat,
      lng,
      displayName: typeof hit.display_name === 'string' ? hit.display_name : query,
    };
  } catch (err) {
    if (err instanceof GeocodingError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new GeocodingError(`El geocodificador no respondio en ${timeoutMs} ms`);
    }
    throw new GeocodingError(
      `Fallo la busqueda de lugar: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
