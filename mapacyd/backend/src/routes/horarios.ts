import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import { createHorarioSchema, updateHorarioSchema } from '../schemas/zona.schema';

export async function horariosRoutes(app: FastifyInstance): Promise<void> {

  // POST /api/zonas/:id/horarios
  app.post<{ Params: { id: string } }>(
    '/zonas/:id/horarios',
    { preHandler: authMiddleware(['admin']) },
    async (request, reply: FastifyReply) => {
      const { id: zonaId } = request.params;

      const zonaCheck = await pool.query(
        'SELECT id FROM zona_cyd WHERE id = $1 AND activo = true',
        [zonaId],
      );
      if (zonaCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'Zona no encontrada', statusCode: 404 });
      }

      const parsed = createHorarioSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.issues[0]?.message ?? 'Validación fallida',
          statusCode: 400,
        });
      }

      const { tipo_dia, hora_inicio, hora_fin } = parsed.data;
      try {
        const result = await pool.query(
          `INSERT INTO horario_zona (zona_id, tipo_dia, hora_inicio, hora_fin)
           VALUES ($1, $2, $3, $4)
           RETURNING
             id, zona_id, tipo_dia, activo,
             to_char(hora_inicio, 'HH24:MI') AS hora_inicio,
             to_char(hora_fin,    'HH24:MI') AS hora_fin`,
          [zonaId, tipo_dia, hora_inicio, hora_fin],
        );
        return reply.code(201).send(result.rows[0]);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // PUT /api/zonas/:id/horarios/:horarioId
  app.put<{ Params: { id: string; horarioId: string } }>(
    '/zonas/:id/horarios/:horarioId',
    { preHandler: authMiddleware(['admin']) },
    async (request, reply: FastifyReply) => {
      const { id: zonaId, horarioId } = request.params;

      const zonaCheck = await pool.query(
        'SELECT id FROM zona_cyd WHERE id = $1 AND activo = true',
        [zonaId],
      );
      if (zonaCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'Zona no encontrada', statusCode: 404 });
      }

      const horarioCheck = await pool.query(
        'SELECT id FROM horario_zona WHERE id = $1 AND zona_id = $2 AND activo = true',
        [horarioId, zonaId],
      );
      if (horarioCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'Horario no encontrado', statusCode: 404 });
      }

      const parsed = updateHorarioSchema.safeParse(request.body);
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

      try {
        const setClauses = Object.keys(fields)
          .map((key, i) => `${key} = $${i + 2}`)
          .join(', ');
        const values = [horarioId, ...Object.values(fields)];
        const result = await pool.query(
          `UPDATE horario_zona
           SET ${setClauses}
           WHERE id = $1
           RETURNING
             id, zona_id, tipo_dia, activo,
             to_char(hora_inicio, 'HH24:MI') AS hora_inicio,
             to_char(hora_fin,    'HH24:MI') AS hora_fin`,
          values,
        );
        return reply.send(result.rows[0]);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // DELETE /api/zonas/:id/horarios/:horarioId  (soft delete)
  app.delete<{ Params: { id: string; horarioId: string } }>(
    '/zonas/:id/horarios/:horarioId',
    { preHandler: authMiddleware(['admin']) },
    async (request, reply: FastifyReply) => {
      const { id: zonaId, horarioId } = request.params;

      const zonaCheck = await pool.query(
        'SELECT id FROM zona_cyd WHERE id = $1 AND activo = true',
        [zonaId],
      );
      if (zonaCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'Zona no encontrada', statusCode: 404 });
      }

      try {
        const result = await pool.query(
          `UPDATE horario_zona
           SET activo = false, deleted_at = NOW()
           WHERE id = $1 AND zona_id = $2 AND activo = true
           RETURNING id`,
          [horarioId, zonaId],
        );
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Horario no encontrado', statusCode: 404 });
        }
        return reply.code(204).send();
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );
}
