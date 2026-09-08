import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db/pool';
import { ISO_POR_COMUNIDAD } from '../padron/osm';
import { getEstadoPadron, intentarReservar, procesarCola } from '../padron/estado';
import { importarPadronSchema } from '../schemas/locales.schema';

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

  /**
   * Importación de padrón a demanda desde la UI, para no depender de SSH + CLI.
   *
   * Comparte candado con el refresco semanal del planificador
   * (`padron/estado.ts`): si ya hay una importación en curso —da igual quién la
   * lanzó— responde 409 y no encola nada.
   */
  app.post('/locales/api/padron/importar', { preHandler: authMiddleware(['admin']) }, async (request, reply) => {
    const parsed = importarPadronSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', detalles: parsed.error.issues });
    }

    const comunidades = parsed.data.comunidades.includes('todas')
      ? Object.keys(ISO_POR_COMUNIDAD)
      : parsed.data.comunidades;

    if (!intentarReservar('manual')) {
      return reply.code(409).send({ error: 'Ya hay una importación en curso' });
    }

    // Desprendida: cada comunidad tarda 20-60 s contra Overpass y no se puede
    // tener la petición HTTP abierta media hora.
    void procesarCola(comunidades, 'manual', {
      info: (m) => app.log.info(m),
      warn: (m) => app.log.warn(m),
    });

    return reply.code(202).send({ encoladas: comunidades });
  });

  /** Estado de la importación en curso (o de la última terminada). */
  app.get(
    '/locales/api/padron/importar/estado',
    { preHandler: authMiddleware(['admin']) },
    async () => getEstadoPadron(),
  );
}
