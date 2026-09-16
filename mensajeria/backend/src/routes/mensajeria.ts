import { FastifyInstance, FastifyReply } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { sendMessageSchema, listQuerySchema, idParamSchema } from '../schemas/mensajeria.schema';
import { getEmailAdapter, getSmsAdapter, getCallAdapter } from '../services/adapterFactory';
import { listCapturedEmails, getCapturedEmail } from '../services/mailStore';
import { listMessageLog, getMessageLogEntry } from '../services/messageLog';

const ROLES_ESCRITURA = ['admin', 'mensajeria_admin'];
const ROLES_LECTURA = ['admin', 'mensajeria_admin', 'mensajeria_invitado'];

export async function mensajeriaRoutes(app: FastifyInstance): Promise<void> {
  // POST /mensajeria/api/send — envío de un único mensaje de prueba
  app.post(
    '/send',
    { preHandler: authMiddleware(ROLES_ESCRITURA) },
    async (request, reply: FastifyReply) => {
      const parsed = sendMessageSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.issues[0]?.message ?? 'Validación fallida',
          statusCode: 400,
        });
      }

      try {
        const input = parsed.data;
        if (input.channel === 'email') {
          const adapter = getEmailAdapter();
          const result = await adapter.send(input);
          return reply.send({ channel: 'email', ...result });
        }
        if (input.channel === 'sms') {
          const adapter = getSmsAdapter();
          const result = await adapter.send(input);
          return reply.send({ channel: 'sms', ...result });
        }
        const adapter = getCallAdapter();
        const result = await adapter.send(input);
        return reply.send({ channel: 'call', ...result });
      } catch (err) {
        return reply.code(500).send({
          error: err instanceof Error ? err.message : 'Error interno',
          statusCode: 500,
        });
      }
    },
  );

  // GET /mensajeria/api/inbox/emails — lista de emails capturados (mock)
  app.get(
    '/inbox/emails',
    { preHandler: authMiddleware(ROLES_LECTURA) },
    async (request, reply: FastifyReply) => {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Validación fallida', statusCode: 400 });
      }
      try {
        const rows = await listCapturedEmails(parsed.data.limit);
        return reply.send(rows);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // GET /mensajeria/api/inbox/emails/:id — detalle de un email capturado
  app.get(
    '/inbox/emails/:id',
    { preHandler: authMiddleware(ROLES_LECTURA) },
    async (request, reply: FastifyReply) => {
      const parsed = idParamSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'id inválido', statusCode: 400 });
      }
      try {
        const row = await getCapturedEmail(parsed.data.id);
        if (!row) return reply.code(404).send({ error: 'No encontrado', statusCode: 404 });
        return reply.send(row);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // GET /mensajeria/api/inbox/log — lista del log de sms/call
  app.get<{ Querystring: { limit?: string; channel?: string } }>(
    '/inbox/log',
    { preHandler: authMiddleware(ROLES_LECTURA) },
    async (request, reply: FastifyReply) => {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Validación fallida', statusCode: 400 });
      }
      const channel = request.query.channel;
      if (channel !== undefined && channel !== 'sms' && channel !== 'call') {
        return reply.code(400).send({ error: "channel debe ser 'sms' o 'call'", statusCode: 400 });
      }
      try {
        const rows = await listMessageLog(parsed.data.limit, channel);
        return reply.send(rows);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // GET /mensajeria/api/inbox/log/:id — detalle de una entrada de sms/call
  app.get(
    '/inbox/log/:id',
    { preHandler: authMiddleware(ROLES_LECTURA) },
    async (request, reply: FastifyReply) => {
      const parsed = idParamSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'id inválido', statusCode: 400 });
      }
      try {
        const row = await getMessageLogEntry(parsed.data.id);
        if (!row) return reply.code(404).send({ error: 'No encontrado', statusCode: 404 });
        return reply.send(row);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );
}
