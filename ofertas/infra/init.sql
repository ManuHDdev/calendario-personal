-- Tabla de búsquedas guardadas para marketplace-watcher (ver
-- openspec/changes/2026-07-27-add-ofertas-app/design.md)
CREATE TABLE IF NOT EXISTS busqueda (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre                      TEXT            NOT NULL,
    keyword                     TEXT            NOT NULL,
    precio_min                  NUMERIC(10, 2),
    precio_max                  NUMERIC(10, 2),
    latitude                    NUMERIC(10, 7)  NOT NULL,
    longitude                   NUMERIC(10, 7)  NOT NULL,
    distance_km                 NUMERIC(6, 2)   NOT NULL,
    milanuncios_province_slug   TEXT,
    language_filter             TEXT,
    console_only                BOOLEAN         NOT NULL DEFAULT FALSE,
    -- Activar/desactivar una búsqueda concreta sin borrarla ni tocar el
    -- on/off global del scraper (scraper_state) — distinto de `activo`
    -- (borrado lógico). GET /searches/active exige habilitada = true.
    habilitada                  BOOLEAN         NOT NULL DEFAULT TRUE,
    sitios                      JSONB           NOT NULL,
    activo                      BOOLEAN         NOT NULL DEFAULT TRUE,
    deleted_at                  TIMESTAMP,
    created_at                  TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMP       NOT NULL DEFAULT NOW()
);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_busqueda_updated_at
    BEFORE UPDATE ON busqueda
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Índice: lookup de búsquedas activas para el endpoint del scraper y para
-- excluir borrados lógicos del listado admin (regla global del monorepo).
CREATE INDEX IF NOT EXISTS idx_busqueda_activo ON busqueda(activo);

-- Índice compuesto: la query de /searches/active filtra por ambas columnas.
CREATE INDEX IF NOT EXISTS idx_busqueda_activo_habilitada ON busqueda(activo, habilitada);

-- Seed: las dos búsquedas que el propietario ya validó manualmente en
-- marketplace-watcher/config.yaml (ver design.md, "Seeding the two searches
-- the owner already validated", y tasks.md 4.4). Se insertan aquí para que
-- se creen automáticamente la primera vez que arranca el contenedor de
-- Postgres — mismo mecanismo de seed que usan gastos/mapacyd para el resto
-- de su esquema (init.sql plano, sin herramienta de migraciones).
INSERT INTO busqueda (nombre, keyword, precio_min, precio_max, latitude, longitude, distance_km, milanuncios_province_slug, sitios)
VALUES
    ('Juegos DS baratos', 'juegos ds', NULL, 15, 39.4753, -6.3724, 30,
     NULL, '{"wallapop": {"enabled": true}, "milanuncios": {"enabled": false}, "vinted": {"enabled": false}}'::jsonb),
    ('Philips Hue baratos', 'philips hue', NULL, 25, 39.4753, -6.3724, 30,
     NULL, '{"wallapop": {"enabled": true}, "milanuncios": {"enabled": false}, "vinted": {"enabled": false}}'::jsonb);

-- Tabla de estado global del scraper externo (marketplace-watcher). Fila
-- única (id=1, forzado por el CHECK) para que el propietario pueda
-- pausar/reanudar el scraper desde la UI (p. ej. en ciertas horas), sin
-- tocar nada de `busqueda`.
CREATE TABLE IF NOT EXISTS scraper_state (
    id          INT         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    running     BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_at  TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Trigger para updated_at automático (misma función que la tabla busqueda).
CREATE TRIGGER update_scraper_state_updated_at
    BEFORE UPDATE ON scraper_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed: la tabla nunca debe estar vacía — arranca en marcha.
INSERT INTO scraper_state (id, running)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;
