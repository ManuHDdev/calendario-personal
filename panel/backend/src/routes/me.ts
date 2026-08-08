import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { changeOwnPassword } from '../services/keycloakAdmin';

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // PUT /panel/api/me/password
  app.put(
    '/panel/api/me/password',
    async (
      request: FastifyRequest<{ Body: { password?: string } }>,
      reply: FastifyReply,
    ) => {
      const { password } = request.body ?? {};
      if (!password) {
        return reply.code(400).send({ error: 'La contraseña es obligatoria' });
      }
      const userId = request.user?.sub;
      if (!userId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      try {
        await changeOwnPassword(userId, password);
        return reply.code(204).send();
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error' });
      }
    },
  );
}
