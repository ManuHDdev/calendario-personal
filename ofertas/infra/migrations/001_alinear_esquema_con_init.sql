-- ─────────────────────────────────────────────────────────────────────────────
-- 001 — Alinear una base de datos ya existente con el esquema de init.sql
--
-- POR QUÉ EXISTE ESTE FICHERO
-- `init.sql` solo lo ejecuta la imagen de Postgres la PRIMERA vez que arranca
-- sobre un directorio de datos vacío. Todo lo que se añadió a init.sql después
-- del primer despliegue (la tabla `scraper_state`, y las columnas
-- `habilitada`, `exclude_keywords`, `language_filter`, `console_only` de
-- `busqueda`) nunca llegó al volumen `ofertas_pgdata` de producción, y este
-- repo no tiene herramienta de migraciones. Síntomas de esa deriva:
--
--   GET /ofertas/api/scraper/state   → 500  relation "scraper_state" does not exist
--   GET /ofertas/api/searches/active → 500  column "habilitada" does not exist
--   GET /ofertas/api/searches        → 200  (es SELECT *, no se entera)
--
-- ES IDEMPOTENTE: se puede ejecutar tantas veces como haga falta, y sobre una
-- base de datos ya correcta no cambia nada. Va en una transacción, así que o
-- se aplica entera o no se aplica.
--
-- Uso:  bash ofertas/infra/migrate.sh
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── busqueda ────────────────────────────────────────────────────────────────
-- Solo las columnas que se pueden añadir sin riesgo a una tabla con filas:
-- las anulables y las que traen DEFAULT. Las NOT NULL sin default (nombre,
-- keyword, latitude, longitude, distance_km, sitios) son del esquema original
-- y no pueden faltar — si faltasen, no habría datos que conservar.
ALTER TABLE busqueda ADD COLUMN IF NOT EXISTS precio_min                NUMERIC(10, 2);
ALTER TABLE busqueda ADD COLUMN IF NOT EXISTS precio_max                NUMERIC(10, 2);
ALTER TABLE busqueda ADD COLUMN IF NOT EXISTS milanuncios_province_slug TEXT;
ALTER TABLE busqueda ADD COLUMN IF NOT EXISTS language_filter           TEXT;
ALTER TABLE busqueda ADD COLUMN IF NOT EXISTS exclude_keywords          TEXT;
ALTER TABLE busqueda ADD COLUMN IF NOT EXISTS console_only              BOOLEAN   NOT NULL DEFAULT FALSE;
ALTER TABLE busqueda ADD COLUMN IF NOT EXISTS habilitada                BOOLEAN   NOT NULL DEFAULT TRUE;
ALTER TABLE busqueda ADD COLUMN IF NOT EXISTS activo                    BOOLEAN   NOT NULL DEFAULT TRUE;
ALTER TABLE busqueda ADD COLUMN IF NOT EXISTS deleted_at                TIMESTAMP;
ALTER TABLE busqueda ADD COLUMN IF NOT EXISTS created_at                TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE busqueda ADD COLUMN IF NOT EXISTS updated_at                TIMESTAMP NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_busqueda_activo            ON busqueda(activo);
CREATE INDEX IF NOT EXISTS idx_busqueda_activo_habilitada ON busqueda(activo, habilitada);

-- ── Función del trigger de updated_at ───────────────────────────────────────
-- Misma definición que init.sql. CREATE OR REPLACE la deja igual si ya estaba.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ── scraper_state ───────────────────────────────────────────────────────────
-- On/off global del scraper. Fila única forzada por el CHECK (id = 1).
CREATE TABLE IF NOT EXISTS scraper_state (
    id          INT         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    running     BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_at  TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- CREATE TRIGGER no admite IF NOT EXISTS en PostgreSQL 15, así que el par
-- DROP+CREATE es la única forma de que esto sea repetible.
DROP TRIGGER IF EXISTS update_busqueda_updated_at ON busqueda;
CREATE TRIGGER update_busqueda_updated_at
    BEFORE UPDATE ON busqueda
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scraper_state_updated_at ON scraper_state;
CREATE TRIGGER update_scraper_state_updated_at
    BEFORE UPDATE ON scraper_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- La tabla nunca debe estar vacía: las rutas leen `rows[0]` sin comprobarlo, y
-- una tabla vacía haría fallar /scraper/state igual que si no existiera.
INSERT INTO scraper_state (id, running)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

COMMIT;
