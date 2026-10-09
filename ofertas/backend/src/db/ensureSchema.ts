import { pool } from './pool';

// Migración idempotente de arranque, mismo patrón que finanzas/mapacyd.
// `infra/init.sql` SOLO se ejecuta al crear el volumen de Postgres desde cero.
// La tabla `scraper_state` (on/off global del scraper) se añadió a init.sql
// después de la creación inicial; sobre una base ya existente no está, y
// `GET /ofertas/api/scraper/state` falla con "relation scraper_state does not
// exist". Crear la tabla y sembrar su fila única (id=1) si faltan.
export async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scraper_state (
      id          INT         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      running     BOOLEAN     NOT NULL DEFAULT TRUE,
      updated_at  TIMESTAMP   NOT NULL DEFAULT NOW()
    );
    INSERT INTO scraper_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  `);
}
