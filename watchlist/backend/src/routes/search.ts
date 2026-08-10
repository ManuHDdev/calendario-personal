import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { searchQuerySchema } from '../schemas/item.schema';
import { searchMovies, searchTv, MissingApiKeyError as TmdbMissingApiKeyError } from '../services/tmdb';
import { searchBooks, MissingApiKeyError as BooksMissingApiKeyError } from '../services/googleBooks';

interface SearchRequest extends FastifyRequest {
  query: { q?: string };
}

async function handleSearch(
  request: SearchRequest,
  reply: FastifyReply,
  tipoLabel: string,
  fn: (q: string) => Promise<unknown>,
): Promise<void> {
  const parsed = searchQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
    return;
  }

  try {
    const results = await fn(parsed.data.q);
    reply.send(results);
  } catch (err) {
    if (err instanceof TmdbMissingApiKeyError || err instanceof BooksMissingApiKeyError) {
      reply.code(503).send({ error: `Búsqueda de ${tipoLabel} no configurada`, statusCode: 503 });
      return;
    }
    reply.code(502).send({ error: 'Error al consultar el proveedor externo', statusCode: 502 });
  }
}

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  // GET /search/movies?q=
  app.get('/search/movies', { preHandler: authMiddleware(['admin']) }, async (request, reply) => {
    await handleSearch(request as SearchRequest, reply, 'películas', searchMovies);
  });

  // GET /search/tv?q=
  app.get('/search/tv', { preHandler: authMiddleware(['admin']) }, async (request, reply) => {
    await handleSearch(request as SearchRequest, reply, 'series', searchTv);
  });

  // GET /search/books?q=
  app.get('/search/books', { preHandler: authMiddleware(['admin']) }, async (request, reply) => {
    await handleSearch(request as SearchRequest, reply, 'libros', searchBooks);
  });
}
