/**
 * Asegura en el arranque que existan las tablas del importador de alquiler
 * turístico (Inside Airbnb).
 *
 * POR QUÉ EXISTE ADEMÁS DE `infra/init.sql`: mismo motivo que
 * `ensureSchemaCapitales.ts` — `init.sql` solo se ejecuta al crear el
 * volumen de Postgres desde cero, y el contenedor `finanzas-db` de
 * producción ya existe con datos. Este módulo ejecuta los mismos
 * `CREATE TABLE IF NOT EXISTS` en cada arranque del backend, ANTES de
 * arrancar el importador. Hay un comentario cruzado en `infra/init.sql`
 * señalando este fichero — si se toca el esquema, tocar los dos.
 */

import { pool } from '../db/pool';

export async function ensureSchemaAirbnb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alquiler_turistico_listing (
      listing_id TEXT NOT NULL,
      ciudad TEXT NOT NULL,
      snapshot_date DATE NOT NULL,
      nombre TEXT,
      barrio_grupo TEXT,
      barrio TEXT,
      latitud DOUBLE PRECISION,
      longitud DOUBLE PRECISION,
      tipo_habitacion TEXT,
      precio_noche NUMERIC,
      estancia_minima_noches INTEGER,
      num_resenas INTEGER,
      resenas_ultimos_12_meses INTEGER,
      resenas_por_mes NUMERIC,
      ultima_resena DATE,
      anuncios_del_anfitrion INTEGER,
      disponibilidad_365 INTEGER,
      actualizado_en TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (listing_id, snapshot_date)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_alquiler_turistico_ciudad_fecha ON alquiler_turistico_listing (ciudad, snapshot_date);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_alquiler_turistico_barrio ON alquiler_turistico_listing (ciudad, barrio);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS alquiler_turistico_estado (
      id INTEGER PRIMARY KEY DEFAULT 1,
      ultima_ejecucion TIMESTAMP,
      ultima_ejecucion_ok BOOLEAN,
      filas_importadas INTEGER,
      error TEXT,
      CONSTRAINT alquiler_turistico_estado_singleton CHECK (id = 1)
    );
  `);

  await pool.query(`
    INSERT INTO alquiler_turistico_estado (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  `);
}
