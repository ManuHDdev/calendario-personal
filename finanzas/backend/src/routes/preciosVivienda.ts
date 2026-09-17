import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import { preciosViviendaQuerySchema, preciosViviendaCapitalQuerySchema } from '../schemas/preciosVivienda.schema';

const ROLES_LECTURA = ['admin', 'invitado'];

export async function preciosViviendaRoutes(app: FastifyInstance): Promise<void> {
  // GET /precios-vivienda/provincias
  app.get(
    '/precios-vivienda/provincias',
    { preHandler: authMiddleware(ROLES_LECTURA) },
    async (_request, reply: FastifyReply) => {
      try {
        const result = await pool.query<{ nombre: string }>(
          `SELECT DISTINCT nombre FROM precio_vivienda WHERE ambito = 'provincia' ORDER BY nombre`,
        );
        return reply.send(result.rows.map((r) => r.nombre));
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // GET /precios-vivienda/estado
  app.get(
    '/precios-vivienda/estado',
    { preHandler: authMiddleware(ROLES_LECTURA) },
    async (_request, reply: FastifyReply) => {
      try {
        const result = await pool.query(
          `SELECT ultima_ejecucion, ultima_ejecucion_ok, filas_importadas, error FROM importacion_estado WHERE id = 1`,
        );
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Sin estado de importación registrado', statusCode: 404 });
        }
        return reply.send(result.rows[0]);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // GET /precios-vivienda?nombre=<provincia|ccaa|TOTAL NACIONAL>
  app.get<{ Querystring: { nombre?: string } }>(
    '/precios-vivienda',
    { preHandler: authMiddleware(ROLES_LECTURA) },
    async (request, reply: FastifyReply) => {
      const parsed = preciosViviendaQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.issues[0]?.message ?? 'Validación fallida',
          statusCode: 400,
        });
      }

      try {
        const existe = await pool.query('SELECT 1 FROM precio_vivienda WHERE nombre = $1 LIMIT 1', [
          parsed.data.nombre,
        ]);
        if (existe.rows.length === 0) {
          return reply.code(400).send({ error: `nombre desconocido: "${parsed.data.nombre}"`, statusCode: 400 });
        }

        // DISTINCT ON (anio, trimestre): las 7 comunidades uniprovinciales
        // tienen dos filas por trimestre bajo el mismo nombre (una
        // ambito='ccaa' y otra ambito='provincia', mismo precio_m2 —
        // duplicado a propósito para que el desplegable de provincias las
        // incluya, ver xlsParser.ts). Sin este filtro, esas 7 regiones
        // devolverían cada punto dos veces. Se prefiere 'provincia' cuando
        // existen ambas variantes.
        const result = await pool.query<{ precio_m2: string | null; [key: string]: unknown }>(
          `SELECT DISTINCT ON (anio, trimestre)
             ambito, nombre, comunidad_autonoma, anio, trimestre, precio_m2
           FROM precio_vivienda
           WHERE nombre = $1
           ORDER BY anio, trimestre, (ambito = 'provincia') DESC`,
          [parsed.data.nombre],
        );
        // node-pg devuelve NUMERIC como string (para no perder precisión) —
        // hay que convertirlo a number explícitamente, si no el frontend
        // recibe "670.80" entre comillas y cualquier cálculo con
        // Number.isFinite/Math.min/Math.max sobre ese valor falla en silencio.
        const filas = result.rows.map((r) => ({
          ...r,
          precio_m2: r.precio_m2 === null ? null : Number(r.precio_m2),
        }));
        return reply.send(filas);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // ───────────────────────────────────────────────────────────────────────
  // Rutas de la variante "por capital" (anuncios de Fotocasa/pisos.com), que
  // complementan (no sustituyen) las tres rutas de arriba, basadas en el XLS
  // oficial del Ministerio por provincia.
  // ───────────────────────────────────────────────────────────────────────

  // GET /precios-vivienda/capitales
  app.get(
    '/precios-vivienda/capitales',
    { preHandler: authMiddleware(ROLES_LECTURA) },
    async (_request, reply: FastifyReply) => {
      try {
        const result = await pool.query<{ capital: string }>(
          `SELECT DISTINCT capital FROM precio_vivienda_capital ORDER BY capital`,
        );
        return reply.send(result.rows.map((r) => r.capital));
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // GET /precios-vivienda/capital/estado
  app.get(
    '/precios-vivienda/capital/estado',
    { preHandler: authMiddleware(ROLES_LECTURA) },
    async (_request, reply: FastifyReply) => {
      try {
        const result = await pool.query(
          `SELECT ultima_ejecucion, ultima_ejecucion_ok, capitales_ok, capitales_fallidas, error
           FROM capital_scraper_estado WHERE id = 1`,
        );
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Sin estado de scraper registrado', statusCode: 404 });
        }
        return reply.send(result.rows[0]);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // GET /precios-vivienda/capital?nombre=<capital>
  app.get<{ Querystring: { nombre?: string } }>(
    '/precios-vivienda/capital',
    { preHandler: authMiddleware(ROLES_LECTURA) },
    async (request, reply: FastifyReply) => {
      const parsed = preciosViviendaCapitalQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.issues[0]?.message ?? 'Validación fallida',
          statusCode: 400,
        });
      }

      try {
        const existe = await pool.query('SELECT 1 FROM precio_vivienda_capital WHERE capital = $1 LIMIT 1', [
          parsed.data.nombre,
        ]);
        if (existe.rows.length === 0) {
          return reply.code(400).send({ error: `nombre desconocido: "${parsed.data.nombre}"`, statusCode: 400 });
        }

        // Media ponderada por número de anuncios entre los portales que
        // tengan fila ese día — no una media simple de medias: un portal con
        // 40 anuncios pesa más que uno con 3, igual que pesaría en un
        // promedio real sobre el conjunto combinado.
        const result = await pool.query<{ fecha_captura: string; precio_m2: string | null; num_anuncios_total: string }>(
          `SELECT
             fecha_captura,
             SUM(precio_m2_medio * num_anuncios) / NULLIF(SUM(num_anuncios), 0) AS precio_m2,
             SUM(num_anuncios) AS num_anuncios_total
           FROM precio_vivienda_capital
           WHERE capital = $1
           GROUP BY fecha_captura
           ORDER BY fecha_captura`,
          [parsed.data.nombre],
        );
        // node-pg devuelve NUMERIC como string — mismo cuidado que en
        // /precios-vivienda (ver comentario más arriba en este fichero).
        const filas = result.rows.map((r) => ({
          fecha_captura: r.fecha_captura,
          precio_m2: r.precio_m2 === null ? null : Number(r.precio_m2),
          num_anuncios_total: Number(r.num_anuncios_total),
        }));
        return reply.send(filas);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );
}
