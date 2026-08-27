import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import { savedSearchCreateSchema, savedSearchUpdateSchema } from '../schemas/ruta.schema';
import {
  listSavedSearches,
  getSavedSearchById,
  createSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
} from '../db/queries';
import type { SavedRouteSearch } from '../types/ruta';

const ADMIN_ONLY = ['admin'];

/** Postgres returns NUMERIC as a string; the API contract says number. */
function toDto(row: SavedRouteSearch): SavedRouteSearch {
  return {
    ...row,
    origen_lat: Number(row.origen_lat),
    origen_lng: Number(row.origen_lng),
    destino_lat: Number(row.destino_lat),
    destino_lng: Number(row.destino_lng),
    desvio_max_km: Number(row.desvio_max_km),
    min_price: row.min_price === null ? null : Number(row.min_price),
    max_price: row.max_price === null ? null : Number(row.max_price),
  };
}

export async function savedSearchesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/searches', { preHandler: authMiddleware(ADMIN_ONLY) }, async (request, reply) => {
    try {
      const { text, values } = listSavedSearches();
      const result = await pool.query<SavedRouteSearch>(text, values);
      return reply.send(result.rows.map(toDto));
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Error interno', statusCode: 500 });
    }
  });

  app.get<{ Params: { id: string } }>(
    '/searches/:id',
    { preHandler: authMiddleware(ADMIN_ONLY) },
    async (request, reply: FastifyReply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) {
        return reply.code(400).send({ error: 'ID debe ser un numero valido', statusCode: 400 });
      }
      try {
        const { text, values } = getSavedSearchById(id);
        const result = await pool.query<SavedRouteSearch>(text, values);
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Busqueda no encontrada', statusCode: 404 });
        }
        return reply.send(toDto(result.rows[0]));
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ error: 'Error interno', statusCode: 500 });
      }
    },
  );

  app.post('/searches', { preHandler: authMiddleware(ADMIN_ONLY) }, async (request, reply) => {
    const parsed = savedSearchCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.issues[0]?.message ?? 'Validacion fallida',
        statusCode: 400,
      });
    }
    try {
      const { text, values } = createSavedSearch(parsed.data);
      const result = await pool.query<SavedRouteSearch>(text, values);
      return reply.code(201).send(toDto(result.rows[0]));
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Error interno', statusCode: 500 });
    }
  });

  app.patch<{ Params: { id: string } }>(
    '/searches/:id',
    { preHandler: authMiddleware(ADMIN_ONLY) },
    async (request, reply: FastifyReply) => {
      const parsed = savedSearchUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.issues[0]?.message ?? 'Validacion fallida',
          statusCode: 400,
        });
      }

      const id = Number(request.params.id);
      if (!Number.isInteger(id)) {
        return reply.code(400).send({ error: 'ID debe ser un numero valido', statusCode: 400 });
      }

      try {
        const { text, values } = updateSavedSearch(id, parsed.data);
        const result = await pool.query<SavedRouteSearch>(text, values);
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Busqueda no encontrada', statusCode: 404 });
        }
        return reply.send(toDto(result.rows[0]));
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ error: 'Error interno', statusCode: 500 });
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/searches/:id',
    { preHandler: authMiddleware(ADMIN_ONLY) },
    async (request, reply: FastifyReply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) {
        return reply.code(400).send({ error: 'ID debe ser un numero valido', statusCode: 400 });
      }
      try {
        const { text, values } = deleteSavedSearch(id);
        const result = await pool.query(text, values);
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Busqueda no encontrada', statusCode: 404 });
        }
        return reply.code(204).send();
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ error: 'Error interno', statusCode: 500 });
      }
    },
  );
}
