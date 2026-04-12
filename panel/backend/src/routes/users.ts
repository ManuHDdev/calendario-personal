import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authAdminMiddleware } from '../middleware/auth';
import {
  listUsers,
  listRoles,
  createUser,
  updateUser,
  deleteUser,
} from '../services/keycloakAdmin';

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authAdminMiddleware);

  // GET /panel/api/users
  app.get('/panel/api/users', async (_req, reply) => {
    try {
      return await listUsers();
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error' });
    }
  });

  // GET /panel/api/roles
  app.get('/panel/api/roles', async () => listRoles());

  // POST /panel/api/users
  app.post(
    '/panel/api/users',
    async (
      request: FastifyRequest<{ Body: { username?: string; email?: string; password?: string; roles?: string[]; enabled?: boolean } }>,
      reply: FastifyReply,
    ) => {
      const { username, email, password, roles, enabled } = request.body ?? {};
      if (!username || !password) {
        return reply.code(400).send({ error: 'username y password son obligatorios' });
      }
      try {
        const user = await createUser({ username, email, password, roles: roles ?? [], enabled });
        return reply.code(201).send(user);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error';
        return reply.code(msg.includes('ya existe') ? 409 : 500).send({ error: msg });
      }
    },
  );

  // PUT /panel/api/users/:id
  app.put(
    '/panel/api/users/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { email?: string; password?: string; roles?: string[]; enabled?: boolean } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { email, password, roles, enabled } = request.body ?? {};
      try {
        const user = await updateUser(id, { email, password, roles, enabled });
        return reply.send(user);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error' });
      }
    },
  );

  // DELETE /panel/api/users/:id
  app.delete(
    '/panel/api/users/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      try {
        await deleteUser(id);
        return reply.code(204).send();
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error' });
      }
    },
  );
}
