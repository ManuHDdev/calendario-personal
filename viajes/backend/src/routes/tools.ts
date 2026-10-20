import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { getPlace, getTrip, listPlaces } from '../db/queries';
import {
  distanceQuerySchema,
  geocodeReverseSchema,
  geocodeSearchSchema,
  matrixQuerySchema,
  nearestQuerySchema,
  tripDistanceQuerySchema,
} from '../schemas/viajes.schema';
import { haversineMatrix, type Profile } from '../lib/geo';
import { nearestLodgings } from '../lib/itinerary';
import { roadMatrix, routeBetween } from '../lib/routing';
import { GeocodingError } from '../lib/geocoding';
import { READ_ROLES, isUuid, notFound, parseOr400, type AppDeps } from './context';

/** How many of the straight-line nearest lodgings also get a road distance. */
const NEAREST_ROAD_LIMIT = 3;

export async function toolsRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const read = { preHandler: authMiddleware(READ_ROLES) };

  /** Straight-line + road distance between two arbitrary coordinates. */
  app.get('/distance', read, async (request, reply) => {
    const q = parseOr400(distanceQuerySchema, request.query, reply);
    if (!q) return;
    const profile = q.profile as Profile;
    const r = await routeBetween({ lat: q.fromLat, lng: q.fromLng }, { lat: q.toLat, lng: q.toLng }, profile, deps.routing);
    return { profile, straightM: r.straightM, distanceM: r.distanceM, durationS: r.durationS, approx: r.approx, geometry: r.geometry };
  });

  /** Same, between two places of a trip (the "pick two places and measure" tool). */
  app.get<{ Params: { id: string } }>('/trips/:id/distance', read, async (request, reply) => {
    const q = parseOr400(tripDistanceQuerySchema, request.query, reply);
    if (!q) return;
    if (!isUuid(request.params.id) || !(await getTrip(request.params.id))) return notFound(reply, 'Trip');
    const [from, to] = await Promise.all([getPlace(request.params.id, q.from), getPlace(request.params.id, q.to)]);
    if (!from || !to) return notFound(reply, 'Place');
    const profile = q.profile as Profile;
    const r = await routeBetween(from, to, profile, deps.routing);
    return { profile, from: from.id, to: to.id, straightM: r.straightM, distanceM: r.distanceM, durationS: r.durationS, approx: r.approx, geometry: r.geometry };
  });

  /** Distance matrix: straight-line always, road (one OSRM /table call) on request. */
  app.get<{ Params: { id: string } }>('/trips/:id/distance-matrix', read, async (request, reply) => {
    const q = parseOr400(matrixQuerySchema, request.query, reply);
    if (!q) return;
    if (!isUuid(request.params.id) || !(await getTrip(request.params.id))) return notFound(reply, 'Trip');
    const all = await listPlaces(request.params.id);
    const byId = new Map(all.map((p) => [p.id, p]));
    const picked = q.ids.map((id) => byId.get(id));
    if (picked.some((p) => !p)) return notFound(reply, 'Place');
    const places = picked as NonNullable<(typeof picked)[number]>[];

    const profile = q.profile as Profile;
    const straightM = haversineMatrix(places);
    const road = q.road === 'true' ? await roadMatrix(places, profile, deps.routing) : null;
    return {
      profile,
      places: places.map((p) => ({ id: p.id, name: p.name, type: p.type })),
      straightM,
      road,
    };
  });

  /** "Nearest lodging to this POI": straight-line ranking, road distance for the closest few. */
  app.get<{ Params: { id: string; placeId: string } }>(
    '/trips/:id/places/:placeId/nearest-lodging',
    read,
    async (request, reply) => {
      const q = parseOr400(nearestQuerySchema, request.query, reply);
      if (!q) return;
      const { id, placeId } = request.params;
      if (!isUuid(id) || !isUuid(placeId) || !(await getTrip(id))) return notFound(reply, 'Trip');
      const [poi, places] = await Promise.all([getPlace(id, placeId), listPlaces(id)]);
      if (!poi) return notFound(reply, 'Place');

      const ranked = nearestLodgings(poi, places);
      const profile = q.profile as Profile;
      const withRoad = [];
      for (let i = 0; i < ranked.length; i++) {
        const entry = ranked[i];
        if (q.road === 'true' && i < NEAREST_ROAD_LIMIT) {
          const r = await routeBetween(entry.lodging, poi, profile, deps.routing);
          withRoad.push({ ...entry, road: { distanceM: r.distanceM, durationS: r.durationS, approx: r.approx } });
        } else {
          withRoad.push({ ...entry, road: null });
        }
      }
      return { profile, placeId, lodgings: withRoad };
    },
  );

  // ── Geocoding (Nominatim proxy) ────────────────────────────────────────────
  app.get('/geocode/search', read, async (request, reply) => {
    const q = parseOr400(geocodeSearchSchema, request.query, reply);
    if (!q) return;
    try {
      return { results: await deps.geocoder.search(q.q) };
    } catch (err) {
      if (err instanceof GeocodingError) return reply.code(err.statusCode).send({ error: err.message, statusCode: err.statusCode });
      throw err;
    }
  });

  app.get('/geocode/reverse', read, async (request, reply) => {
    const q = parseOr400(geocodeReverseSchema, request.query, reply);
    if (!q) return;
    try {
      const results = await deps.geocoder.reverse(q.lat, q.lng);
      return { result: results[0] ?? null };
    } catch (err) {
      if (err instanceof GeocodingError) return reply.code(err.statusCode).send({ error: err.message, statusCode: err.statusCode });
      throw err;
    }
  });
}
