import { pool } from './pool';

// Migración idempotente de arranque, mismo patrón que finanzas/mapacyd.
// `infra/init.sql` SOLO se ejecuta al crear el volumen de Postgres desde cero.
// La tabla `api_usage_counter` (contador diario de TMDB/Google Books) se añadió
// a init.sql después de la creación inicial; sobre una base ya existente no
// está, y `GET /usage` falla. Crearla si falta.
export async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_usage_counter (
      api_name    TEXT    NOT NULL,
      usage_date  DATE    NOT NULL,
      calls       INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (api_name, usage_date)
    );
  `);
}
