import { FastifyInstance, FastifyReply } from 'fastify';
import { internalAuthMiddleware } from '../middleware/internalAuth';
import { getUsageToday, nextUtcMidnight } from '../db/usageCounter';

// Google Books: cuota gratuita por defecto de Google Cloud (1000/día por
// proyecto). TMDB no publica un tope diario — dailyLimit/remaining quedan a
// null y el dashboard solo muestra "llamadas hoy" para esa API (ver design.md
// "Decisions" en el proposal de esta feature).
const GOOGLE_BOOKS_DAILY_LIMIT = 1000;

export interface ApiUsageEntry {
  api: string;
  label: string;
  callsToday: number;
  dailyLimit: number | null;
  remaining: number | null;
  resetsAt: string;
}

export async function usageRoutes(app: FastifyInstance): Promise<void> {
  // GET /watchlist/api/usage — consumo de hoy de TMDB y Google Books (interno, para Panel)
  app.get(
    '/usage',
    { preHandler: internalAuthMiddleware() },
    async (_request, reply: FastifyReply) => {
      const [tmdbCalls, googleBooksCalls] = await Promise.all([
        getUsageToday('tmdb'),
        getUsageToday('google_books'),
      ]);
      const resetsAt = nextUtcMidnight();
      const entries: ApiUsageEntry[] = [
        {
          api: 'tmdb',
          label: 'TMDB',
          callsToday: tmdbCalls,
          dailyLimit: null,
          remaining: null,
          resetsAt,
        },
        {
          api: 'google_books',
          label: 'Google Books',
          callsToday: googleBooksCalls,
          dailyLimit: GOOGLE_BOOKS_DAILY_LIMIT,
          remaining: Math.max(0, GOOGLE_BOOKS_DAILY_LIMIT - googleBooksCalls),
          resetsAt,
        },
      ];
      return reply.send(entries);
    },
  );
}
