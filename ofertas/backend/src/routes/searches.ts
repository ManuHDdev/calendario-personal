import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import { scraperAuthMiddleware } from '../middleware/scraperAuth';
import { createBusquedaSchema, updateBusquedaSchema } from '../schemas/busqueda.schema';
import { buildActiveBusquedasQuery, buildListBusquedasQuery } from '../db/queries';
import { toActiveSearchDto } from '../dto/activeSearch.dto';
import type { Busqueda } from '../types/busqueda';

export async function searchesRoutes(app: FastifyInstance): Promise<void> {
  // GET /searches/active — gateado por bearer token estático (scraperAuth),
  // NUNCA por Keycloak. Único consumidor: marketplace-watcher. Registrado
  // antes de /searches/:id: Fastify prioriza rutas estáticas sobre
  // parametrizadas igualmente, pero se deja explícito por claridad.
  app.get(
    '/searches/active',
    { preHandler: scraperAuthMiddleware() },
    async (_request, reply: FastifyReply) => {
      try {
        const { text, values } = buildActiveBusquedasQuery();
        const result = await pool.query<Busqueda>(text, values);
        return reply.send(result.rows.map(toActiveSearchDto));
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // GET /searches — gateado por Keycloak JWT + rol admin
  app.get('/searches', { preHandler: authMiddleware(['admin']) }, async (_request, reply: FastifyReply) => {
    try {
      const { text, values } = buildListBusquedasQuery();
      const result = await pool.query(text, values);
      return reply.send(result.rows);
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
    }
  });

  // POST /searches
  app.post('/searches', { preHandler: authMiddleware(['admin']) }, async (request, reply: FastifyReply) => {
    const parsed = createBusquedaSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
    }
    const {
      nombre, keyword, precio_min, precio_max,
      latitude, longitude, distance_km, milanuncios_province_slug, language_filter, console_only, sitios,
    } = parsed.data;
    try {
      const result = await pool.query(
        `INSERT INTO busqueda
           (nombre, keyword, precio_min, precio_max, latitude, longitude, distance_km, milanuncios_province_slug, language_filter, console_only, sitios)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          nombre, keyword, precio_min ?? null, precio_max ?? null,
          latitude, longitude, distance_km, milanuncios_province_slug ?? null,
          language_filter ?? null, console_only ?? false, JSON.stringify(sitios),
        ],
      );
      return reply.code(201).send(result.rows[0]);
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
    }
  });

  // PATCH /searches/:id
  app.patch<{ Params: { id: string } }>(
    '/searches/:id',
    { preHandler: authMiddleware(['admin']) },
    async (request, reply: FastifyReply) => {
      const parsed = updateBusquedaSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
      }
      const fields = parsed.data;
      if (Object.keys(fields).length === 0) {
        return reply.code(400).send({ error: 'No se han enviado campos a actualizar', statusCode: 400 });
      }

      const { id } = request.params;
      try {
        const check = await pool.query('SELECT id FROM busqueda WHERE id = $1 AND activo = true', [id]);
        if (check.rows.length === 0) {
          return reply.code(404).send({ error: 'Búsqueda no encontrada', statusCode: 404 });
        }

        const entries = Object.entries(fields).map(
          ([key, value]) => [key, key === 'sitios' ? JSON.stringify(value) : value] as const,
        );
        const setClauses = entries.map(([key], i) => `${key} = $${i + 2}`).join(', ');
        const values = [id, ...entries.map(([, value]) => value)];
        const result = await pool.query(
          `UPDATE busqueda SET ${setClauses}, updated_at = NOW() WHERE id = $1 AND activo = true RETURNING *`,
          values,
        );
        return reply.send(result.rows[0]);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // DELETE /searches/:id — soft delete
  app.delete<{ Params: { id: string } }>(
    '/searches/:id',
    { preHandler: authMiddleware(['admin']) },
    async (request, reply: FastifyReply) => {
      const { id } = request.params;
      try {
        const result = await pool.query(
          `UPDATE busqueda SET activo = false, deleted_at = NOW() WHERE id = $1 AND activo = true RETURNING id`,
          [id],
        );
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Búsqueda no encontrada', statusCode: 404 });
        }
        return reply.code(204).send();
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );
}
