import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { getTrip, listPlaces } from '../db/queries';
import { buildGpx } from '../lib/gpx';
import { buildIcs } from '../lib/ics';
import { READ_ROLES, isUuid, notFound, slugify } from './context';

export async function exportsRoutes(app: FastifyInstance): Promise<void> {
  const read = { preHandler: authMiddleware(READ_ROLES) };

  app.get<{ Params: { id: string } }>('/trips/:id/export.gpx', read, async (request, reply) => {
    const trip = isUuid(request.params.id) ? await getTrip(request.params.id) : null;
    if (!trip) return notFound(reply, 'Trip');
    const gpx = buildGpx(trip, await listPlaces(trip.id));
    return reply
      .header('Content-Type', 'application/gpx+xml; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${slugify(trip.name)}.gpx"`)
      .send(gpx);
  });

  app.get<{ Params: { id: string } }>('/trips/:id/export.ics', read, async (request, reply) => {
    const trip = isUuid(request.params.id) ? await getTrip(request.params.id) : null;
    if (!trip) return notFound(reply, 'Trip');
    const ics = buildIcs(trip, await listPlaces(trip.id));
    return reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${slugify(trip.name)}.ics"`)
      .send(ics);
  });
}
