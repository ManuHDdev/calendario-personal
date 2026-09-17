/**
 * Asegura en el arranque que existan las tablas del scraper de precios de
 * vivienda por capital.
 *
 * POR QUÉ EXISTE ADEMÁS DE `infra/init.sql`: `init.sql` solo se ejecuta
 * cuando Postgres crea el volumen de datos por primera vez (ver
 * `docker-entrypoint-initdb.d` de la imagen oficial) — el contenedor
 * `finanzas-db` de producción YA EXISTE con datos reales, así que reeditar
 * `init.sql` no crea nada en un redeploy. Este módulo ejecuta los mismos
 * `CREATE TABLE IF NOT EXISTS` a mano, en cada arranque del backend, ANTES
 * de que arranque el scraper — así el esquema converge tanto en una
 * instalación nueva (donde `init.sql` ya las creó, y estos `IF NOT EXISTS`
 * son no-op) como en producción (donde `init.sql` nunca se re-ejecuta).
 * Mantener los dos ficheros en el mismo estado es responsabilidad de quien
 * edite uno: hay un comentario cruzado en `infra/init.sql` señalando este
 * fichero.
 */

import { pool } from '../db/pool';

export async function ensureSchemaCapitales(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS precio_vivienda_capital (
      id SERIAL PRIMARY KEY,
      capital TEXT NOT NULL,
      provincia TEXT NOT NULL,
      portal TEXT NOT NULL,
      fecha_captura DATE NOT NULL,
      precio_m2_medio NUMERIC(10,2) NOT NULL,
      num_anuncios INTEGER NOT NULL,
      actualizado_en TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (capital, portal, fecha_captura)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_precio_vivienda_capital_capital ON precio_vivienda_capital (capital);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS capital_scraper_estado (
      id INTEGER PRIMARY KEY DEFAULT 1,
      ultima_ejecucion TIMESTAMP,
      ultima_ejecucion_ok BOOLEAN,
      capitales_ok INTEGER,
      capitales_fallidas INTEGER,
      error TEXT,
      CONSTRAINT capital_scraper_estado_singleton CHECK (id = 1)
    );
  `);

  await pool.query(`
    INSERT INTO capital_scraper_estado (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  `);
}
