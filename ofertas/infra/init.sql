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
