import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import { scraperAuthMiddleware } from '../middleware/scraperAuth';
import { updateScraperStateSchema } from '../schemas/scraperState.schema';
import { buildGetScraperStateQuery, buildUpdateScraperStateQuery } from '../db/queries';
import type { ScraperState } from '../types/scraperState';

export async function scraperStateRoutes(app: FastifyInstance): Promise<void> {
  // GET /scraper/state — gateado por Keycloak JWT + rol admin. Usado por la
  // UI de Ofertas para pintar el estado actual del scraper al cargar.
  app.get('/scraper/state', { preHandler: authMiddleware(['admin']) }, async (_request, reply: FastifyReply) => {
    try {
      const { text, values } = buildGetScraperStateQuery();
      const result = await pool.query<ScraperState>(text, values);
      return reply.send(result.rows[0]);
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
    }
  });

  // PATCH /scraper/state — gateado por Keycloak JWT + rol admin. Único
  // punto de escritura del estado; lo llama el botón de la UI.
  app.patch('/scraper/state', { preHandler: authMiddleware(['admin']) }, async (request, reply: FastifyReply) => {
    const parsed = updateScraperStateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
    }
    try {
      const { text, values } = buildUpdateScraperStateQuery(parsed.data.running);
      const result = await pool.query<ScraperState>(text, values);
      return reply.send(result.rows[0]);
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
    }
  });

  // GET /scraper/status — gateado por bearer token estático (scraperAuth),
  // NUNCA por Keycloak. Único consumidor: marketplace-watcher, que lo
  // consulta antes de cada ejecución para saber si debe correr o quedarse
  // en pausa. Misma independencia de los dos mecanismos de auth que ya
  // aplica a GET /searches/active (ver middleware/scraperAuth.ts).
  app.get(
    '/scraper/status',
    { preHandler: scraperAuthMiddleware() },
    async (_request, reply: FastifyReply) => {
      try {
        const { text, values } = buildGetScraperStateQuery();
        const result = await pool.query<ScraperState>(text, values);
        return reply.send({ running: result.rows[0].running });
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );
}
