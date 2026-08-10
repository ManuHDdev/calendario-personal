import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import { createItemSchema, updateItemSchema, listItemsQuerySchema } from '../schemas/item.schema';
import { buildListQuery } from '../db/queries';

export async function itemsRoutes(app: FastifyInstance): Promise<void> {
  // GET /items?tipo=&estado=
  app.get('/items', { preHandler: authMiddleware(['admin']) }, async (request, reply: FastifyReply) => {
    const parsed = listItemsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
    }
    try {
      const { text, values } = buildListQuery(parsed.data);
      const result = await pool.query(text, values);
      return reply.send(result.rows);
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
    }
  });

  // POST /items
  app.post('/items', { preHandler: authMiddleware(['admin']) }, async (request, reply: FastifyReply) => {
    const parsed = createItemSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
    }
    const { tipo, external_id, fuente, titulo, autor, poster_url, sinopsis, estado, nota, rating } = parsed.data;
    try {
      const result = await pool.query(
        `INSERT INTO item (tipo, external_id, fuente, titulo, autor, poster_url, sinopsis, estado, nota, rating)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          tipo,
          external_id ?? null,
          fuente ?? null,
          titulo,
          autor ?? null,
          poster_url ?? null,
          sinopsis ?? null,
          estado ?? 'pendiente',
          nota ?? null,
          rating ?? null,
        ],
      );
      return reply.code(201).send(result.rows[0]);
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
    }
  });

  // PATCH /items/:id
  app.patch<{ Params: { id: string } }>(
    '/items/:id',
    { preHandler: authMiddleware(['admin']) },
    async (request, reply: FastifyReply) => {
      const parsed = updateItemSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
      }
      const fields = parsed.data;
      if (Object.keys(fields).length === 0) {
        return reply.code(400).send({ error: 'No se han enviado campos a actualizar', statusCode: 400 });
      }

      const { id } = request.params;
      try {
        const check = await pool.query('SELECT id FROM item WHERE id = $1 AND activo = true', [id]);
        if (check.rows.length === 0) {
          return reply.code(404).send({ error: 'Item no encontrado', statusCode: 404 });
        }

        const setClauses = Object.keys(fields).map((key, i) => `${key} = $${i + 2}`).join(', ');
        const values = [id, ...Object.values(fields)];
        const result = await pool.query(
          `UPDATE item SET ${setClauses}, updated_at = NOW() WHERE id = $1 AND activo = true RETURNING *`,
          values,
        );
        return reply.send(result.rows[0]);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // DELETE /items/:id  (soft delete)
  app.delete<{ Params: { id: string } }>(
    '/items/:id',
    { preHandler: authMiddleware(['admin']) },
    async (request, reply: FastifyReply) => {
      const { id } = request.params;
      try {
        const result = await pool.query(
          `UPDATE item SET activo = false, deleted_at = NOW() WHERE id = $1 AND activo = true RETURNING id`,
          [id],
        );
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Item no encontrado', statusCode: 404 });
        }
        return reply.code(204).send();
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );
}
