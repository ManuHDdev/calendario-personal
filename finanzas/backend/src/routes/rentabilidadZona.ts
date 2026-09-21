import { FastifyInstance, FastifyReply } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { rentabilidadZonaQuerySchema } from '../schemas/rentabilidadZona.schema';
import { calcularRentabilidadZona } from '../services/rentabilidadZona';

const ROLES_LECTURA = ['admin', 'invitado'];

export async function rentabilidadZonaRoutes(app: FastifyInstance): Promise<void> {
  // GET /rentabilidad-zona?ubicacion=<texto>
  app.get<{ Querystring: { ubicacion?: string } }>(
    '/rentabilidad-zona',
    { preHandler: authMiddleware(ROLES_LECTURA) },
    async (request, reply: FastifyReply) => {
      const parsed = rentabilidadZonaQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.issues[0]?.message ?? 'Validación fallida',
          statusCode: 400,
        });
      }

      try {
        const resultado = await calcularRentabilidadZona(parsed.data.ubicacion, {
          info: (msg) => request.log.info(msg),
          warn: (msg) => request.log.warn(msg),
          error: (msg) => request.log.error(msg),
        });
        return reply.send(resultado);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );
}
