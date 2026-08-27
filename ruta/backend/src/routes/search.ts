import { FastifyInstance, FastifyReply } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { routeSearchSchema } from '../schemas/ruta.schema';
import { searchAlongRoute } from '../services/routeSearch';
import { geocode, GeocodingError } from '../services/geocoding';
import { RouteError } from '../services/ors';

const ADMIN_ONLY = ['admin'];

/**
 * A corridor search fans out to dozens of Wallapop requests, so it is far more
 * expensive than a normal endpoint. This caps how many can be in flight for
 * the whole process, so an impatient double-click cannot multiply the load we
 * put on Wallapop.
 */
const MAX_CONCURRENT_SEARCHES = 2;
let inFlightSearches = 0;

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  // GET /geocode?q= — free text to coordinates, for the origin/destination fields
  app.get<{ Querystring: { q?: string } }>(
    '/geocode',
    { preHandler: authMiddleware(ADMIN_ONLY) },
    async (request, reply: FastifyReply) => {
      const query = request.query.q?.trim();
      if (!query) {
        return reply.code(400).send({ error: 'El parametro q es obligatorio', statusCode: 400 });
      }

      try {
        const result = await geocode(query);
        return reply.send(result);
      } catch (err) {
        if (err instanceof GeocodingError) {
          return reply.code(err.statusCode).send({ error: err.message, statusCode: err.statusCode });
        }
        request.log.error(err);
        return reply.code(500).send({ error: 'Error interno', statusCode: 500 });
      }
    },
  );

  // POST /search — the corridor search itself
  app.post('/search', { preHandler: authMiddleware(ADMIN_ONLY) }, async (request, reply) => {
    const parsed = routeSearchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.issues[0]?.message ?? 'Validacion fallida',
        statusCode: 400,
      });
    }

    if (inFlightSearches >= MAX_CONCURRENT_SEARCHES) {
      return reply.code(429).send({
        error: 'Ya hay una busqueda en curso; espera a que termine',
        statusCode: 429,
      });
    }

    inFlightSearches++;
    try {
      const result = await searchAlongRoute({
        origen: parsed.data.origen,
        destino: parsed.data.destino,
        keyword: parsed.data.keyword,
        desvioMaxKm: parsed.data.desvio_max_km,
        minPrice: parsed.data.min_price,
        maxPrice: parsed.data.max_price,
        excluirPalabras: parsed.data.excluir_palabras,
      });
      return reply.send(result);
    } catch (err) {
      // A routing failure is the user's problem to act on (bad points, no road
      // route, quota spent), so it keeps its own status rather than becoming a
      // blanket 500.
      if (err instanceof RouteError) {
        return reply.code(err.statusCode).send({ error: err.message, statusCode: err.statusCode });
      }
      request.log.error(err);
      return reply.code(500).send({ error: 'Error interno', statusCode: 500 });
    } finally {
      inFlightSearches--;
    }
  });
}
