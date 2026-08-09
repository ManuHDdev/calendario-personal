import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import { createHorarioSchema, updateHorarioSchema } from '../schemas/zona.schema';

export async function horariosRoutes(app: FastifyInstance): Promise<void> {

  // POST /api/zonas/:id/horarios
  app.post<{ Params: { id: string } }>(
    '/zonas/:id/horarios',
    { preHandler: authMiddleware(['admin', 'mapacyd_admin']) },
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

      const { tipo_dia, hora_inicio, hora_fin, sin_restriccion } = parsed.data;

      // Un tipo_dia no puede mezclar una franja normal con una entrada
      // "sin restricción" — ambas comparten el mismo espacio para esa zona+día.
      // Varias franjas normales SÍ pueden coexistir (p.ej. con un descanso al
      // mediodía), así que solo se bloquea el caso mixto, no normal+normal.
      const conflictoCheck = sin_restriccion
        ? await pool.query(
            `SELECT id FROM horario_zona
             WHERE zona_id = $1 AND tipo_dia = $2 AND activo = true
             LIMIT 1`,
            [zonaId, tipo_dia],
          )
        : await pool.query(
            `SELECT id FROM horario_zona
             WHERE zona_id = $1 AND tipo_dia = $2 AND activo = true AND sin_restriccion = true
             LIMIT 1`,
            [zonaId, tipo_dia],
          );
      if (conflictoCheck.rows.length > 0) {
        return reply.code(400).send({
          error: 'Ya existe una configuración para este día — elimínala primero',
          statusCode: 400,
        });
      }

      try {
        const result = await pool.query(
          `INSERT INTO horario_zona (zona_id, tipo_dia, hora_inicio, hora_fin, sin_restriccion)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING
             id, zona_id, tipo_dia, activo, sin_restriccion,
             to_char(hora_inicio, 'HH24:MI') AS hora_inicio,
             to_char(hora_fin,    'HH24:MI') AS hora_fin`,
          [zonaId, tipo_dia, sin_restriccion ? null : hora_inicio, sin_restriccion ? null : hora_fin, sin_restriccion],
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
    { preHandler: authMiddleware(['admin', 'mapacyd_admin']) },
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
        `SELECT sin_restriccion,
                to_char(hora_inicio, 'HH24:MI') AS hora_inicio,
                to_char(hora_fin,    'HH24:MI') AS hora_fin
         FROM horario_zona WHERE id = $1 AND zona_id = $2 AND activo = true`,
        [horarioId, zonaId],
      );
      if (horarioCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'Horario no encontrado', statusCode: 404 });
      }
      const existing = horarioCheck.rows[0];

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

      // El schema solo valida hora_fin > hora_inicio (o la ausencia de horas
      // con sin_restriccion) cuando esos campos vienen juntos en el mismo
      // body. En una actualización parcial hay que recalcular el estado
      // EFECTIVO tras el merge con el registro existente — si no, se podía
      // guardar un horario invertido o una fila inconsistente (p.ej.
      // sin_restriccion=true con horas todavía informadas, o sin_restriccion
      // pasando a false sin horas que la sustituyan).
      const effectiveSinRestriccion = fields.sin_restriccion ?? existing.sin_restriccion;
      const effectiveInicio = effectiveSinRestriccion ? null : (fields.hora_inicio ?? existing.hora_inicio);
      const effectiveFin    = effectiveSinRestriccion ? null : (fields.hora_fin    ?? existing.hora_fin);

      if (!effectiveSinRestriccion) {
        if (!effectiveInicio || !effectiveFin) {
          return reply.code(400).send({
            error: 'hora_inicio y hora_fin son obligatorias al desactivar sin_restriccion',
            statusCode: 400,
          });
        }
        if (effectiveFin <= effectiveInicio) {
          return reply.code(400).send({
            error: 'hora_fin debe ser mayor que hora_inicio',
            statusCode: 400,
          });
        }
      }

      // Se escriben siempre los tres campos derivados (no solo los que vinieron
      // en el body) para que la fila resultante nunca quede en un estado
      // intermedio inconsistente con el CHECK de la tabla.
      const mergedFields = {
        ...fields,
        sin_restriccion: effectiveSinRestriccion,
        hora_inicio:     effectiveInicio,
        hora_fin:        effectiveFin,
      };

      try {
        const setClauses = Object.keys(mergedFields)
          .map((key, i) => `${key} = $${i + 3}`)
          .join(', ');
        const values = [horarioId, zonaId, ...Object.values(mergedFields)];
        const result = await pool.query(
          `UPDATE horario_zona
           SET ${setClauses}
           WHERE id = $1 AND zona_id = $2
           RETURNING
             id, zona_id, tipo_dia, activo, sin_restriccion,
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
    { preHandler: authMiddleware(['admin', 'mapacyd_admin']) },
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
