import { Pool } from 'pg';

export const pool = new Pool({
  host:     process.env.OFERTAS_DB_HOST     || 'localhost',
  database: process.env.OFERTAS_DB_NAME     || 'ofertas',
  user:     process.env.OFERTAS_DB_USER     || 'ofertas',
  password: process.env.OFERTAS_DB_PASSWORD,
  port:     parseInt(process.env.OFERTAS_DB_PORT || '5432'),
  // Sin esto `pg` espera indefinidamente a que se establezca la conexión: si
  // Postgres no está, /health se queda colgado en vez de responder 503 y el
  // healthcheck de Docker solo puede cortarlo por su propio timeout, sin
  // llegar a registrar la causa en el log.
  connectionTimeoutMillis: 5_000,
});

/**
 * OBLIGATORIO, no es defensa preventiva.
 *
 * `pg.Pool` emite 'error' cuando el servidor tira una conexión que estaba
 * ociosa en el pool — un reinicio de `ofertas-db`, un `pg_terminate_backend`,
 * o un firewall que corta conexiones largas. En Node un evento 'error' sin
 * listener es una excepción no capturada, así que sin esto el proceso ENTERO
 * se muere:
 *
 *     error: terminating connection due to administrator command   (57P01)
 *     Emitted 'error' event on BoundPool instance
 *
 * Es decir: cada reinicio de Postgres se llevaba por delante el backend.
 * Reproducido parando Postgres con el backend en marcha.
 *
 * El pool descarta solo el cliente roto y abre otro en la siguiente query, así
 * que registrar y seguir es exactamente lo correcto: no hay nada que reparar
 * a mano, solo hay que no morirse.
 */
pool.on('error', (err) => {
  console.error('[ofertas] conexión de Postgres perdida en el pool:', err.message);
});
