import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import { createZonaSchema, updateZonaSchema } from '../schemas/zona.schema';

const BASE_QUERY = `
  SELECT z.*,
    COALESCE(
      json_agg(
        json_build_object(
          'id', h.id,
          'zona_id', h.zona_id,
          'tipo_dia', h.tipo_dia,
          'hora_inicio', to_char(h.hora_inicio, 'HH24:MI'),
          'hora_fin', to_char(h.hora_fin, 'HH24:MI'),
          'sin_restriccion', h.sin_restriccion,
          'activo', h.activo
        ) ORDER BY h.tipo_dia, h.hora_inicio
      ) FILTER (WHERE h.id IS NOT NULL AND h.activo = true),
      '[]'
    ) AS horarios
  FROM zona_cyd z
  LEFT JOIN horario_zona h ON h.zona_id = z.id
`;

export async function zonasRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/zonas?ciudad=X
  app.get<{ Querystring: { ciudad?: string } }>(
    '/zonas',
    { preHandler: authMiddleware(['admin', 'familia', 'mapacyd_admin', 'mapacyd_invitado']) },
    async (request, reply: FastifyReply) => {
      try {
        const { ciudad } = request.query;
        const conditions: string[] = ['z.activo = true'];
        const values: unknown[] = [];

        if (ciudad) {
          values.push(`%${ciudad}%`);
          conditions.push(`z.ciudad ILIKE $${values.length}`);
        }

        const where = `WHERE ${conditions.join(' AND ')}`;
        const query = `${BASE_QUERY} ${where} GROUP BY z.id ORDER BY z.nombre`;
        const result = await pool.query(query, values);
        return reply.send(result.rows);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // GET /api/zonas/:id
  app.get<{ Params: { id: string } }>(
    '/zonas/:id',
    { preHandler: authMiddleware(['admin', 'familia', 'mapacyd_admin', 'mapacyd_invitado']) },
    async (request, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const query = `${BASE_QUERY} WHERE z.id = $1 AND z.activo = true GROUP BY z.id`;
        const result = await pool.query(query, [id]);
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Zona no encontrada', statusCode: 404 });
        }
        return reply.send(result.rows[0]);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // POST /api/zonas
  app.post(
    '/zonas',
    { preHandler: authMiddleware(['admin', 'mapacyd_admin']) },
    async (request, reply: FastifyReply) => {
      const parsed = createZonaSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.issues[0]?.message ?? 'Validación fallida',
          statusCode: 400,
        });
      }

      const { nombre, descripcion, latitud, longitud, ciudad, tipo } = parsed.data;
      try {
        const result = await pool.query(
          `INSERT INTO zona_cyd (nombre, descripcion, latitud, longitud, ciudad, tipo)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [nombre, descripcion ?? null, latitud, longitud, ciudad, tipo],
        );
        return reply.code(201).send(result.rows[0]);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // PUT /api/zonas/:id
  app.put<{ Params: { id: string } }>(
    '/zonas/:id',
    { preHandler: authMiddleware(['admin', 'mapacyd_admin']) },
    async (request, reply: FastifyReply) => {
      const parsed = updateZonaSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.issues[0]?.message ?? 'Validación fallida',
          statusCode: 400,
        });
      }

      const fields = parsed.data;
      if (Object.keys(fields).length === 0) {
        return reply.code(400).send({ error: 'No se han enviado campos a actualizar', statusCode: 400 });
      }

      const { id } = request.params;
      try {
        const check = await pool.query(
          'SELECT id FROM zona_cyd WHERE id = $1 AND activo = true',
          [id],
        );
        if (check.rows.length === 0) {
          return reply.code(404).send({ error: 'Zona no encontrada', statusCode: 404 });
        }

        const setClauses = Object.keys(fields)
          .map((key, i) => `${key} = $${i + 2}`)
          .join(', ');
        const values = [id, ...Object.values(fields)];
        const result = await pool.query(
          `UPDATE zona_cyd SET ${setClauses}, updated_at = NOW()
           WHERE id = $1 AND activo = true
           RETURNING *`,
          values,
        );
        return reply.send(result.rows[0]);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // DELETE /api/zonas/:id  (soft delete)
  app.delete<{ Params: { id: string } }>(
    '/zonas/:id',
    { preHandler: authMiddleware(['admin', 'mapacyd_admin']) },
    async (request, reply: FastifyReply) => {
      const { id } = request.params;
      try {
        const result = await pool.query(
          `UPDATE zona_cyd
           SET activo = false, deleted_at = NOW()
           WHERE id = $1 AND activo = true
           RETURNING id`,
          [id],
        );
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Zona no encontrada', statusCode: 404 });
        }

        await pool.query(
          `UPDATE horario_zona
           SET activo = false, deleted_at = NOW()
           WHERE zona_id = $1`,
          [id],
        );
        return reply.code(204).send();
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );
}
