import { pool } from './pool';
import type { Place, Trip } from '../lib/types';
import type { RouteCache, RouteResult } from '../lib/routing';
import type { GeocodeCache, GeocodeHit } from '../lib/geocoding';

// ── Row mapping ──────────────────────────────────────────────────────────────

interface TripRow {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface PlaceRow {
  id: string;
  trip_id: string;
  type: Place['type'];
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  notes: string | null;
  url: string | null;
  cost: number | null;
  visit_date: string | null;
  start_time: string | null;
  duration_min: number | null;
  check_in: string | null;
  check_out: string | null;
  visited: boolean;
  day_order: number;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

export function toTrip(row: TripRow): Trip {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toPlace(row: PlaceRow): Place {
  return {
    id: row.id,
    tripId: row.trip_id,
    type: row.type,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    notes: row.notes,
    url: row.url,
    cost: row.cost,
    visitDate: row.visit_date,
    // Postgres TIME comes back as HH:MM:SS; the API speaks HH:MM.
    startTime: row.start_time ? row.start_time.slice(0, 5) : null,
    durationMin: row.duration_min,
    checkIn: row.check_in,
    checkOut: row.check_out,
    visited: row.visited,
    dayOrder: row.day_order,
  };
}

const PLACE_COLUMNS = `id, trip_id, type, name, lat, lng, address, notes, url, cost, visit_date,
  start_time, duration_min, check_in, check_out, visited, day_order`;
const TRIP_COLUMNS = 'id, name, description, start_date, end_date, created_at, updated_at';

// ── Trips ────────────────────────────────────────────────────────────────────

export async function listTrips(): Promise<Array<Trip & { placeCount: number }>> {
  const res = await pool.query<TripRow & { place_count: string }>(
    `SELECT t.id, t.name, t.description, t.start_date, t.end_date, t.created_at, t.updated_at,
            (SELECT COUNT(*) FROM place p WHERE p.trip_id = t.id AND p.activo = TRUE) AS place_count
       FROM trip t
      WHERE t.activo = TRUE
      ORDER BY COALESCE(t.start_date, t.created_at::date) DESC, t.created_at DESC`,
  );
  return res.rows.map((r) => ({ ...toTrip(r), placeCount: Number(r.place_count) }));
}

export async function getTrip(id: string): Promise<Trip | null> {
  const res = await pool.query<TripRow>(`SELECT ${TRIP_COLUMNS} FROM trip WHERE id = $1 AND activo = TRUE`, [id]);
  return res.rows[0] ? toTrip(res.rows[0]) : null;
}

export async function createTrip(
  data: { name: string; description?: string | null; startDate?: string | null; endDate?: string | null },
  ownerId: string | null,
): Promise<Trip> {
  const res = await pool.query<TripRow>(
    `INSERT INTO trip (name, description, start_date, end_date, owner_keycloak_user_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${TRIP_COLUMNS}`,
    [data.name, data.description ?? null, data.startDate ?? null, data.endDate ?? null, ownerId],
  );
  return toTrip(res.rows[0]);
}

const TRIP_UPDATABLE: Record<string, string> = {
  name: 'name',
  description: 'description',
  startDate: 'start_date',
  endDate: 'end_date',
};

/** Builds `SET col = $n, ...` from an allowlist so request keys never reach the SQL text. */
export function buildUpdate(
  data: Record<string, unknown>,
  allowed: Record<string, string>,
  startIndex = 1,
): { sets: string[]; values: unknown[] } {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(allowed)) {
    if (data[key] === undefined) continue;
    values.push(data[key]);
    sets.push(`${column} = $${startIndex + values.length - 1}`);
  }
  return { sets, values };
}

export async function updateTrip(id: string, data: Record<string, unknown>): Promise<Trip | null> {
  const { sets, values } = buildUpdate(data, TRIP_UPDATABLE, 2);
  if (sets.length === 0) return getTrip(id);
  const res = await pool.query<TripRow>(
    `UPDATE trip SET ${sets.join(', ')} WHERE id = $1 AND activo = TRUE RETURNING ${TRIP_COLUMNS}`,
    [id, ...values],
  );
  return res.rows[0] ? toTrip(res.rows[0]) : null;
}

/** Soft delete: the trip and its places stay in the database. */
export async function softDeleteTrip(id: string): Promise<boolean> {
  const res = await pool.query(
    'UPDATE trip SET activo = FALSE, deleted_at = NOW() WHERE id = $1 AND activo = TRUE',
    [id],
  );
  return (res.rowCount ?? 0) > 0;
}

// ── Places ───────────────────────────────────────────────────────────────────

export async function listPlaces(tripId: string): Promise<Place[]> {
  const res = await pool.query<PlaceRow>(
    `SELECT ${PLACE_COLUMNS} FROM place
      WHERE trip_id = $1 AND activo = TRUE
      ORDER BY visit_date NULLS LAST, day_order, start_time NULLS LAST, created_at`,
    [tripId],
  );
  return res.rows.map(toPlace);
}

export async function getPlace(tripId: string, placeId: string): Promise<Place | null> {
  const res = await pool.query<PlaceRow>(
    `SELECT ${PLACE_COLUMNS} FROM place WHERE id = $1 AND trip_id = $2 AND activo = TRUE`,
    [placeId, tripId],
  );
  return res.rows[0] ? toPlace(res.rows[0]) : null;
}

export async function createPlace(tripId: string, d: Omit<Place, 'id' | 'tripId' | 'dayOrder' | 'visited'> & { visited?: boolean }): Promise<Place> {
  // Append at the end of its day.
  const next = await pool.query<{ next: number }>(
    `SELECT COALESCE(MAX(day_order), -1) + 1 AS next FROM place
      WHERE trip_id = $1 AND activo = TRUE AND visit_date IS NOT DISTINCT FROM $2::date`,
    [tripId, d.visitDate],
  );
  const res = await pool.query<PlaceRow>(
    `INSERT INTO place (trip_id, type, name, lat, lng, address, notes, url, cost, visit_date,
                        start_time, duration_min, check_in, check_out, visited, day_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING ${PLACE_COLUMNS}`,
    [
      tripId, d.type, d.name, d.lat, d.lng, d.address, d.notes, d.url, d.cost, d.visitDate,
      d.startTime, d.durationMin, d.checkIn, d.checkOut, d.visited ?? false, next.rows[0].next,
    ],
  );
  return toPlace(res.rows[0]);
}

const PLACE_UPDATABLE: Record<string, string> = {
  type: 'type',
  name: 'name',
  lat: 'lat',
  lng: 'lng',
  address: 'address',
  notes: 'notes',
  url: 'url',
  cost: 'cost',
  visitDate: 'visit_date',
  startTime: 'start_time',
  durationMin: 'duration_min',
  checkIn: 'check_in',
  checkOut: 'check_out',
  visited: 'visited',
};

export async function updatePlace(tripId: string, placeId: string, data: Record<string, unknown>): Promise<Place | null> {
  const { sets, values } = buildUpdate(data, PLACE_UPDATABLE, 3);
  if (sets.length === 0) return getPlace(tripId, placeId);
  const res = await pool.query<PlaceRow>(
    `UPDATE place SET ${sets.join(', ')}
      WHERE id = $1 AND trip_id = $2 AND activo = TRUE RETURNING ${PLACE_COLUMNS}`,
    [placeId, tripId, ...values],
  );
  return res.rows[0] ? toPlace(res.rows[0]) : null;
}

export async function softDeletePlace(tripId: string, placeId: string): Promise<boolean> {
  const res = await pool.query(
    'UPDATE place SET activo = FALSE, deleted_at = NOW() WHERE id = $1 AND trip_id = $2 AND activo = TRUE',
    [placeId, tripId],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Moves the given places into `date` (null = unscheduled) in the given order.
 * Returns false when any id does not belong to the trip (nothing is changed).
 */
export async function reorderPlaces(tripId: string, date: string | null, placeIds: string[]): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id FROM place WHERE trip_id = $1 AND activo = TRUE AND type <> 'alojamiento' AND id = ANY($2::uuid[])`,
      [tripId, placeIds],
    );
    if (found.rowCount !== placeIds.length) {
      await client.query('ROLLBACK');
      return false;
    }
    for (let i = 0; i < placeIds.length; i++) {
      await client.query(
        // Dropping a place into the unscheduled list also drops its start time.
        `UPDATE place SET visit_date = $1::date, day_order = $2,
                start_time = CASE WHEN $1::date IS NULL THEN NULL ELSE start_time END
          WHERE id = $3 AND trip_id = $4`,
        [date, i, placeIds[i], tripId],
      );
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ── Caches ───────────────────────────────────────────────────────────────────

const ROUTE_CACHE_TTL_DAYS = 30;

export const pgRouteCache: RouteCache = {
  async get(key: string): Promise<RouteResult | null> {
    const res = await pool.query<{ result: RouteResult }>(
      `SELECT result FROM route_cache WHERE cache_key = $1
          AND created_at > NOW() - make_interval(days => $2)`,
      [key, ROUTE_CACHE_TTL_DAYS],
    );
    return res.rows[0]?.result ?? null;
  },
  async set(key: string, value: RouteResult): Promise<void> {
    await pool.query(
      `INSERT INTO route_cache (cache_key, result) VALUES ($1, $2::jsonb)
       ON CONFLICT (cache_key) DO UPDATE SET result = EXCLUDED.result, created_at = NOW()`,
      [key, JSON.stringify(value)],
    );
  },
};

export const pgGeocodeCache: GeocodeCache = {
  async get(key: string): Promise<GeocodeHit[] | null> {
    const res = await pool.query<{ results: GeocodeHit[] }>('SELECT results FROM geocode_cache WHERE cache_key = $1', [key]);
    return res.rows[0]?.results ?? null;
  },
  async set(key: string, value: GeocodeHit[]): Promise<void> {
    await pool.query(
      `INSERT INTO geocode_cache (cache_key, results) VALUES ($1, $2::jsonb)
       ON CONFLICT (cache_key) DO UPDATE SET results = EXCLUDED.results, created_at = NOW()`,
      [key, JSON.stringify(value)],
    );
  },
};
