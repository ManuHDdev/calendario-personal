import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import { preciosViviendaQuerySchema } from '../schemas/preciosVivienda.schema';

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
        const result = await pool.query(
          `SELECT DISTINCT ON (anio, trimestre)
             ambito, nombre, comunidad_autonoma, anio, trimestre, precio_m2
           FROM precio_vivienda
           WHERE nombre = $1
           ORDER BY anio, trimestre, (ambito = 'provincia') DESC`,
          [parsed.data.nombre],
        );
        return reply.send(result.rows);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );
}
