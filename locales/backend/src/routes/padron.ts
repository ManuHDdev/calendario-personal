import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db/pool';

export async function rutasPadron(app: FastifyInstance): Promise<void> {
  /**
   * Estado del padrón por municipio.
   *
   * Existe para poder ver DÓNDE no fiarse: un municipio marcado como
   * insuficiente nunca dará un verde, y esta vista es la que lo explica.
   */
  app.get('/locales/api/padron/cobertura', { preHandler: authMiddleware(['admin']) }, async (request) => {
    const soloIncompletos = (request.query as { incompletos?: string })?.incompletos === 'true';
    const { rows } = await pool.query(
      `SELECT municipio, provincia, farmacias_conocidas, poblacion,
              farmacias_esperadas, suficiente, motivo, calculado_en
         FROM cobertura_municipio
        ${soloIncompletos ? 'WHERE NOT suficiente' : ''}
        ORDER BY suficiente ASC, farmacias_conocidas DESC
        LIMIT 2000`,
    );
    return rows;
  });

  /** Resumen del padrón por comunidad y fuente, para ver qué hay cargado. */
  app.get('/locales/api/padron/resumen', { preHandler: authMiddleware(['admin']) }, async () => {
    const farmacias = await pool.query(
      `SELECT comunidad, fuente, count(*)::int AS total,
              count(*) FILTER (WHERE duplicado_de_id IS NOT NULL)::int AS duplicados,
              max(visto_en) AS ultima_importacion
         FROM farmacia WHERE activo
        GROUP BY comunidad, fuente ORDER BY comunidad, fuente`,
    );
    const centros = await pool.query(
      `SELECT comunidad, fuente, count(*)::int AS total, max(visto_en) AS ultima_importacion
         FROM centro_sanitario WHERE activo
        GROUP BY comunidad, fuente ORDER BY comunidad, fuente`,
    );
    return { farmacias: farmacias.rows, centros: centros.rows };
  });
}
