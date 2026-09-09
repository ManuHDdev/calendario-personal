import { FastifyInstance, FastifyReply } from 'fastify';
import { internalAuthMiddleware } from '../middleware/internalAuth';
import { getUsageToday, nextUtcMidnight } from '../db/usageCounter';

const DAILY_CAP = 2000;

export interface ApiUsageEntry {
  api: string;
  label: string;
  callsToday: number;
  dailyLimit: number | null;
  remaining: number | null;
  resetsAt: string;
}

export async function usageRoutes(app: FastifyInstance): Promise<void> {
  // GET /paraisos/api/usage — consumo de hoy de OpenRouteService (interno, para Panel)
  app.get(
    '/usage',
    { preHandler: internalAuthMiddleware() },
    async (_request, reply: FastifyReply) => {
      const callsToday = await getUsageToday('ors');
      const entries: ApiUsageEntry[] = [
        {
          api: 'ors',
          label: 'OpenRouteService',
          callsToday,
          dailyLimit: DAILY_CAP,
          remaining: Math.max(0, DAILY_CAP - callsToday),
          resetsAt: nextUtcMidnight(),
        },
      ];
      return reply.send(entries);
    },
  );
}
