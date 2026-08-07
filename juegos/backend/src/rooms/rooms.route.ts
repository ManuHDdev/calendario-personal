import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuthenticated } from '../middleware/auth';
import { createRoom } from './roomStore';

const createRoomSchema = z.object({
  gameType: z.enum(['impostor-live', 'trivia-live']),
});

export async function roomsRoutes(app: FastifyInstance): Promise<void> {
  // POST /juegos/api/rooms — ver spec.md "Live room creation and join"
  app.post(
    '/juegos/api/rooms',
    { preHandler: requireAuthenticated },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createRoomSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Bad Request', message: parsed.error.issues[0]?.message });
      }

      const hostId = request.user?.sub;
      const hostUsername = request.user?.preferred_username ?? 'Host';
      if (!hostId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const room = createRoom(parsed.data.gameType, hostId, hostUsername);
      return reply.code(201).send({ roomCode: room.code, gameType: room.gameType, hostId: room.hostId });
    },
  );
}
