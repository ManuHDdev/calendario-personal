import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import { createBusquedaSchema, updateBusquedaSchema } from '../schemas/pisos.schema';
import {
  listBusquedas,
  getBusquedaById,
  createBusqueda,
  updateBusqueda,
  deleteBusqueda,
} from '../db/queries';
import { rastrearBusqueda } from '../services/rastreo';
import { normalizarFila } from '../db/filas';
import type { Busqueda } from '../types/pisos';

const SOLO_ADMIN = ['admin'];

/** UUID v4 en cualquiera de sus versiones; evita mandar basura a Postgres. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function busquedasRoutes(app: FastifyInstance): Promise<void> {
  app.get('/searches', { preHandler: authMiddleware(SOLO_ADMIN) }, async (request, reply) => {
    try {
      const { text, values } = listBusquedas();
      const { rows } = await pool.query<Busqueda>(text, values);
      return reply.send(rows.map(normalizarFila));
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Error interno', statusCode: 500 });
    }
  });

  app.post('/searches', { preHandler: authMiddleware(SOLO_ADMIN) }, async (request, reply) => {
    const parsed = createBusquedaSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.issues[0]?.message ?? 'Validación fallida',
        statusCode: 400,
      });
    }
    try {
      const { text, values } = createBusqueda(parsed.data);
      const { rows } = await pool.query<Busqueda>(text, values);
      return reply.code(201).send(normalizarFila(rows[0]));
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Error interno', statusCode: 500 });
    }
  });

  app.patch<{ Params: { id: string } }>(
    '/searches/:id',
    { preHandler: authMiddleware(SOLO_ADMIN) },
    async (request, reply: FastifyReply) => {
      if (!UUID.test(request.params.id)) {
        return reply.code(400).send({ error: 'ID no válido', statusCode: 400 });
      }
      const parsed = updateBusquedaSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.issues[0]?.message ?? 'Validación fallida',
          statusCode: 400,
        });
      }
      try {
        const { text, values } = updateBusqueda(request.params.id, parsed.data);
        const { rows } = await pool.query<Busqueda>(text, values);
        if (rows.length === 0) {
          return reply.code(404).send({ error: 'Búsqueda no encontrada', statusCode: 404 });
        }
        return reply.send(normalizarFila(rows[0]));
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ error: 'Error interno', statusCode: 500 });
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/searches/:id',
    { preHandler: authMiddleware(SOLO_ADMIN) },
    async (request, reply: FastifyReply) => {
      if (!UUID.test(request.params.id)) {
        return reply.code(400).send({ error: 'ID no válido', statusCode: 400 });
      }
      try {
        const { text, values } = deleteBusqueda(request.params.id);
        const { rows } = await pool.query(text, values);
        if (rows.length === 0) {
          return reply.code(404).send({ error: 'Búsqueda no encontrada', statusCode: 404 });
        }
        return reply.code(204).send();
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ error: 'Error interno', statusCode: 500 });
      }
    },
  );

  /**
   * Rastreo manual de una búsqueda: "mira AHORA".
   *
   * Es el botón que se usa nada más crear una búsqueda, sin esperar a la
   * siguiente vuelta del planificador. No notifica por Telegram: quien lo
   * pulsa está mirando la pantalla, y además la primera pasada de una
   * búsqueda nueva trae decenas de anuncios antiguos que no son novedades.
   */
  app.post<{ Params: { id: string } }>(
    '/searches/:id/rastrear',
    { preHandler: authMiddleware(SOLO_ADMIN) },
    async (request, reply: FastifyReply) => {
      if (!UUID.test(request.params.id)) {
        return reply.code(400).send({ error: 'ID no válido', statusCode: 400 });
      }
      try {
        const { text, values } = getBusquedaById(request.params.id);
        const { rows } = await pool.query<Busqueda>(text, values);
        if (rows.length === 0) {
          return reply.code(404).send({ error: 'Búsqueda no encontrada', statusCode: 404 });
        }

        const resultado = await rastrearBusqueda(normalizarFila(rows[0]), {
          notificarNovedades: false,
        });
        return reply.send({
          encontrados: resultado.encontrados,
          guardados: resultado.guardados,
          fallos: resultado.fallos,
          omitidos: resultado.omitidos,
        });
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({
          error: err instanceof Error ? err.message : 'Error interno',
          statusCode: 500,
        });
      }
    },
  );
}
