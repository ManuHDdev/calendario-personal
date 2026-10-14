import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import {
  createGastoSchema,
  updateGastoSchema,
  listGastosQuerySchema,
  totalesQuerySchema,
  sugerenciasQuerySchema,
} from '../schemas/gasto.schema';
import {
  buildListQuery,
  buildTotalesQuery,
  buildTotalesPorMesQuery,
  buildSugerenciasQuery,
  type CampoSugerencia,
} from '../db/queries';
import { assembleTotales, type FilaTotalCategoria, type FilaTotalMes } from '../db/totales';
import { runOcrPipeline, type Perfil } from '../ocr/pipeline';

export async function gastosRoutes(app: FastifyInstance): Promise<void> {
  // GET /gastos?mes=|anio=&categoria=&estado=&tipo=
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
    const { importe, fecha, comercio, concepto, categoria, estado, tipo } = parsed.data;
    try {
      const result = await pool.query(
        `INSERT INTO gasto (importe, fecha, comercio, concepto, categoria, origen, estado, tipo)
         VALUES ($1, $2, $3, $4, $5, 'manual', $6, $7)
         RETURNING *`,
        [importe, fecha ?? null, comercio, concepto ?? null, categoria ?? null, estado ?? 'confirmado', tipo ?? 'gasto'],
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

  // GET /totales?mes=YYYY-MM | ?anio=YYYY [&categoria=]  (solo estado=confirmado)
  app.get('/totales', { preHandler: authMiddleware(['admin']) }, async (request, reply: FastifyReply) => {
    const parsed = totalesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
    }
    try {
      const { mes, anio, categoria } = parsed.data;
      const cat = buildTotalesQuery({ mes, anio, categoria });
      const porCategoria = await pool.query<FilaTotalCategoria>(cat.text, cat.values);
      let filasMes: FilaTotalMes[] = [];
      if (anio) {
        const porMes = buildTotalesPorMesQuery(anio, categoria);
        filasMes = (await pool.query<FilaTotalMes>(porMes.text, porMes.values)).rows;
      }
      return reply.send(assembleTotales({ mes, anio }, porCategoria.rows, filasMes));
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
    }
  });

  // GET /categorias y /comercios?tipo=  (autocompletado: más usados primero)
  const sugerencias = (campo: CampoSugerencia) =>
    async (request: { query: unknown }, reply: FastifyReply) => {
      const parsed = sugerenciasQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
      }
      try {
        const { text, values } = buildSugerenciasQuery(campo, parsed.data.tipo);
        const result = await pool.query<{ valor: string }>(text, values);
        return reply.send(result.rows.map((r) => r.valor));
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    };
  app.get('/categorias', { preHandler: authMiddleware(['admin']) }, sugerencias('categoria'));
  app.get('/comercios', { preHandler: authMiddleware(['admin']) }, sugerencias('comercio'));

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
