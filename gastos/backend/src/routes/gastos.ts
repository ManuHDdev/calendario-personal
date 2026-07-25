import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import {
  createGastoSchema,
  updateGastoSchema,
  listGastosQuerySchema,
  totalesQuerySchema,
} from '../schemas/gasto.schema';
import { buildListQuery, buildTotalesQuery } from '../db/queries';
import { runOcrPipeline, type Perfil } from '../ocr/pipeline';

export async function gastosRoutes(app: FastifyInstance): Promise<void> {
  // GET /gastos?mes=&categoria=&estado=
  app.get('/gastos', { preHandler: authMiddleware(['admin']) }, async (request, reply: FastifyReply) => {
    const parsed = listGastosQuerySchema.safeParse(request.query);
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

  // POST /gastos  (creación manual — siempre confirmado)
  app.post('/gastos', { preHandler: authMiddleware(['admin']) }, async (request, reply: FastifyReply) => {
    const parsed = createGastoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
    }
    const { importe, fecha, comercio, concepto, categoria } = parsed.data;
    try {
      const result = await pool.query(
        `INSERT INTO gasto (importe, fecha, comercio, concepto, categoria, origen, estado)
         VALUES ($1, $2, $3, $4, $5, 'manual', 'confirmado')
         RETURNING *`,
        [importe, fecha, comercio, concepto ?? null, categoria ?? null],
      );
      return reply.code(201).send(result.rows[0]);
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
    }
  });

  // PATCH /gastos/:id  (edición y/o confirmación de un borrador OCR)
  app.patch<{ Params: { id: string } }>(
    '/gastos/:id',
    { preHandler: authMiddleware(['admin']) },
    async (request, reply: FastifyReply) => {
      const parsed = updateGastoSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
      }
      const fields = parsed.data;
      if (Object.keys(fields).length === 0) {
        return reply.code(400).send({ error: 'No se han enviado campos a actualizar', statusCode: 400 });
      }

      const { id } = request.params;
      try {
        const check = await pool.query('SELECT id FROM gasto WHERE id = $1 AND activo = true', [id]);
        if (check.rows.length === 0) {
          return reply.code(404).send({ error: 'Gasto no encontrado', statusCode: 404 });
        }

        const setClauses = Object.keys(fields).map((key, i) => `${key} = $${i + 2}`).join(', ');
        const values = [id, ...Object.values(fields)];
        const result = await pool.query(
          `UPDATE gasto SET ${setClauses}, updated_at = NOW() WHERE id = $1 AND activo = true RETURNING *`,
          values,
        );
        return reply.send(result.rows[0]);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // DELETE /gastos/:id  (soft delete)
  app.delete<{ Params: { id: string } }>(
    '/gastos/:id',
    { preHandler: authMiddleware(['admin']) },
    async (request, reply: FastifyReply) => {
      const { id } = request.params;
      try {
        const result = await pool.query(
          `UPDATE gasto SET activo = false, deleted_at = NOW() WHERE id = $1 AND activo = true RETURNING id`,
          [id],
        );
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Gasto no encontrado', statusCode: 404 });
        }
        return reply.code(204).send();
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // GET /totales?mes=YYYY-MM  (solo estado=confirmado, agrupado por categoría)
  app.get('/totales', { preHandler: authMiddleware(['admin']) }, async (request, reply: FastifyReply) => {
    const parsed = totalesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
    }
    try {
      const { text, values } = buildTotalesQuery(parsed.data.mes);
      const result = await pool.query<{ categoria: string; total: string }>(text, values);
      const total = result.rows.reduce((acc, r) => acc + Number(r.total), 0);
      return reply.send({
        mes: parsed.data.mes,
        total,
        porCategoria: result.rows.map((r) => ({ categoria: r.categoria, total: Number(r.total) })),
      });
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
    }
  });

  // GET /categorias  (autocompletado del frontend)
  app.get('/categorias', { preHandler: authMiddleware(['admin']) }, async (_request, reply: FastifyReply) => {
    try {
      const result = await pool.query<{ categoria: string }>(
        `SELECT DISTINCT categoria FROM gasto WHERE activo = true AND categoria IS NOT NULL ORDER BY categoria`,
      );
      return reply.send(result.rows.map((r) => r.categoria));
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
    }
  });

  // POST /gastos/ocr  (interno — sigue exigiendo rol admin, ver design.md)
  app.post('/gastos/ocr', { preHandler: authMiddleware(['admin']) }, async (request, reply: FastifyReply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'Falta la imagen', statusCode: 400 });
    }

    const perfilField = data.fields.perfil as { value?: string } | undefined;
    const perfil = perfilField?.value;
    if (perfil !== 'ticket' && perfil !== 'banco') {
      return reply.code(400).send({ error: "El campo 'perfil' debe ser 'ticket' o 'banco'", statusCode: 400 });
    }

    try {
      const buffer = await data.toBuffer();
      const { gasto, draft } = await runOcrPipeline(buffer, perfil as Perfil);
      return reply.code(201).send({ gasto, draft });
    } catch (err) {
      return reply.code(500).send({
        error: err instanceof Error ? err.message : 'Error al procesar la imagen',
        statusCode: 500,
      });
    }
  });
}
