import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import {
  createPlace,
  createTrip,
  getPlace,
  getTrip,
  listPlaces,
  listTrips,
  reorderPlaces,
  softDeletePlace,
  softDeleteTrip,
  updatePlace,
  updateTrip,
} from '../db/queries';
import {
  createPlaceSchema,
  createTripSchema,
  itineraryQuerySchema,
  reorderSchema,
  updatePlaceSchema,
  updateTripSchema,
} from '../schemas/viajes.schema';
import { buildItinerary } from '../lib/itinerary';
import { routeThrough } from '../lib/routing';
import { summarizeTrip } from '../lib/summary';
import type { Profile } from '../lib/geo';
import { READ_ROLES, WRITE_ROLES, isUuid, notFound, parseOr400, type AppDeps } from './context';

type IdParams = { id: string; placeId?: string };

/** Replies 404 for malformed/unknown trip ids; returns the trip otherwise. */
async function loadTrip(request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
  if (!isUuid(request.params.id)) {
    void notFound(reply, 'Trip');
    return null;
  }
  const trip = await getTrip(request.params.id);
  if (!trip) {
    void notFound(reply, 'Trip');
    return null;
  }
  return trip;
}

export async function tripsRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const read = { preHandler: authMiddleware(READ_ROLES) };
  const write = { preHandler: authMiddleware(WRITE_ROLES) };

  // ── Trips ──────────────────────────────────────────────────────────────────
  app.get('/trips', read, async () => listTrips());

  app.post('/trips', write, async (request, reply) => {
    const data = parseOr400(createTripSchema, request.body, reply);
    if (!data) return;
    const trip = await createTrip(data, request.user?.sub ?? null);
    return reply.code(201).send(trip);
  });

  app.get<{ Params: IdParams }>('/trips/:id', read, async (request, reply) => {
    const trip = await loadTrip(request, reply);
    if (!trip) return;
    return { ...trip, places: await listPlaces(trip.id) };
  });

  app.patch<{ Params: IdParams }>('/trips/:id', write, async (request, reply) => {
    const data = parseOr400(updateTripSchema, request.body, reply);
    if (!data) return;
    if (!isUuid(request.params.id)) return notFound(reply, 'Trip');
    const trip = await updateTrip(request.params.id, data);
    return trip ?? notFound(reply, 'Trip');
  });

  app.delete<{ Params: IdParams }>('/trips/:id', write, async (request, reply) => {
    if (!isUuid(request.params.id) || !(await softDeleteTrip(request.params.id))) return notFound(reply, 'Trip');
    return reply.code(204).send();
  });

  // ── Places ─────────────────────────────────────────────────────────────────
  app.post<{ Params: IdParams }>('/trips/:id/places', write, async (request, reply) => {
    const data = parseOr400(createPlaceSchema, request.body, reply);
    if (!data) return;
    const trip = await loadTrip(request, reply);
    if (!trip) return;
    const place = await createPlace(trip.id, {
      type: data.type,
      name: data.name,
      lat: data.lat,
      lng: data.lng,
      address: data.address ?? null,
      notes: data.notes ?? null,
      url: data.url ?? null,
      cost: data.cost ?? null,
      visitDate: data.visitDate ?? null,
      startTime: data.startTime ?? null,
      durationMin: data.durationMin ?? null,
      checkIn: data.checkIn ?? null,
      checkOut: data.checkOut ?? null,
      visited: data.visited,
    });
    return reply.code(201).send(place);
  });

  app.patch<{ Params: IdParams }>('/trips/:id/places/:placeId', write, async (request, reply) => {
    const data = parseOr400(updatePlaceSchema, request.body, reply);
    if (!data) return;
    const { id, placeId } = request.params;
    if (!isUuid(id) || !placeId || !isUuid(placeId)) return notFound(reply, 'Place');

    const patch: Record<string, unknown> = { ...data };
    // A start time makes no sense without a day: unscheduling clears it.
    if (data.visitDate === null) patch.startTime = null;
    if (data.startTime && data.visitDate === undefined) {
      const current = await getPlace(id, placeId);
      if (!current) return notFound(reply, 'Place');
      if (!current.visitDate) return reply.code(400).send({ error: 'startTime needs a visitDate', statusCode: 400 });
    }
    const place = await updatePlace(id, placeId, patch);
    return place ?? notFound(reply, 'Place');
  });

  app.delete<{ Params: IdParams }>('/trips/:id/places/:placeId', write, async (request, reply) => {
    const { id, placeId } = request.params;
    if (!isUuid(id) || !placeId || !isUuid(placeId) || !(await softDeletePlace(id, placeId))) {
      return notFound(reply, 'Place');
    }
    return reply.code(204).send();
  });

  /** Drag-and-drop: set the order of a day (or the unscheduled list). */
  app.post<{ Params: IdParams }>('/trips/:id/reorder', write, async (request, reply) => {
    const data = parseOr400(reorderSchema, request.body, reply);
    if (!data) return;
    const trip = await loadTrip(request, reply);
    if (!trip) return;
    const ok = await reorderPlaces(trip.id, data.date, data.placeIds);
    if (!ok) return reply.code(400).send({ error: 'Some places do not belong to this trip', statusCode: 400 });
    return { places: await listPlaces(trip.id) };
  });

  // ── Itinerary & summary ────────────────────────────────────────────────────
  app.get<{ Params: IdParams }>('/trips/:id/itinerary', read, async (request, reply) => {
    const query = parseOr400(itineraryQuerySchema, request.query, reply);
    if (!query) return;
    const trip = await loadTrip(request, reply);
    if (!trip) return;
    const places = await listPlaces(trip.id);
    const profile = query.profile as Profile;
    return buildItinerary(places, (points, prof) => routeThrough(points, prof, deps.routing), {
      profile,
      withLodging: query.withLodging === 'true',
      roundTrip: query.roundTrip === 'true',
    });
  });

  app.get<{ Params: IdParams }>('/trips/:id/summary', read, async (request, reply) => {
    const trip = await loadTrip(request, reply);
    if (!trip) return;
    return summarizeTrip(await listPlaces(trip.id));
  });
}
