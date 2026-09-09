import { FastifyInstance, FastifyReply } from 'fastify';
import { authAdminMiddleware } from '../middleware/auth';
import { getAllUsage } from '../services/subappUsage';

export async function usageRoutes(app: FastifyInstance): Promise<void> {
  // GET /panel/api/usage — consumo agregado de las APIs externas rastreadas
  app.get(
    '/panel/api/usage',
    { preHandler: authAdminMiddleware },
    async (_request, reply: FastifyReply) => {
      const usage = await getAllUsage();
      return reply.send(usage);
    },
  );
}
