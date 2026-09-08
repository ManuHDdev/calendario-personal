import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { scraperStateSchema } from '../schemas/locales.schema';
import { getScraperState, setScraperState } from '../db/queries';

export async function rutasScraper(app: FastifyInstance): Promise<void> {
  app.get(
    '/locales/api/scraper/state',
    { preHandler: authMiddleware(['admin']) },
    async () => {
      const { running, updatedAt } = await getScraperState();
      return { running, updated_at: updatedAt };
    },
  );

  app.patch(
    '/locales/api/scraper/state',
    { preHandler: authMiddleware(['admin']) },
    async (request, reply) => {
      const parsed = scraperStateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Bad Request', detalles: parsed.error.issues });
      }
      await setScraperState(parsed.data.running);
      const { running, updatedAt } = await getScraperState();
      return { running, updated_at: updatedAt };
    },
  );
}
