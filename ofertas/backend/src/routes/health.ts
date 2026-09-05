import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';

/**
 * Healthcheck.
 *
 * Comprueba la base de datos DE VERDAD. La versión anterior devolvía
 * `{status:'ok'}` sin tocar Postgres, así que el healthcheck de Docker seguía
 * en verde mientras todas las rutas devolvían 500 — el contenedor parecía
 * sano justo cuando la app estaba inservible, y eso es peor que no tener
 * healthcheck: manda a buscar la avería al sitio equivocado.
 *
 * OJO: con `restart: unless-stopped` Docker NO reinicia un contenedor por
 * estar unhealthy. Esto hace que `docker ps` diga la verdad, no que la app se
 * recupere sola.
 *
 * El detalle del error se registra en el log pero NO se devuelve en la
 * respuesta: /health es la única ruta sin autenticación de este backend, y el
 * mensaje de pg incluye host, usuario y base de datos.
 */

export type DbPing = () => Promise<void>;

const pingPool: DbPing = async () => {
  await pool.query('SELECT 1');
};

export interface HealthRoutesOptions {
  /** Inyectable en tests para no necesitar un Postgres real. */
  ping?: DbPing;
}

export async function healthRoutes(
  app: FastifyInstance,
  opts: HealthRoutesOptions = {},
): Promise<void> {
  const ping = opts.ping ?? pingPool;

  app.get('/health', async (_request, reply: FastifyReply) => {
    try {
      await ping();
      return reply.send({ status: 'ok', db: 'ok', timestamp: new Date().toISOString() });
    } catch (err) {
      app.log.error({ err }, 'healthcheck: la base de datos no responde');
      return reply
        .code(503)
        .send({ status: 'degraded', db: 'error', timestamp: new Date().toISOString() });
    }
  });
}
