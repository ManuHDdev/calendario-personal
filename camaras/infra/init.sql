-- Cámaras públicas de Cáceres, Badajoz, Mérida y Villanueva de la Serena.
-- NOTA: este fichero SOLO se ejecuta al crear el volumen de Postgres desde cero.
-- El mismo esquema (idempotente) vive en backend/src/db/ensureSchema.ts y se
-- aplica en cada arranque del backend: si se toca uno, hay que tocar el otro.

CREATE TABLE IF NOT EXISTS camara (
    id            SERIAL           PRIMARY KEY,
    origen        TEXT             NOT NULL CHECK (origen IN ('dgt', 'manual')),
    external_id   TEXT,                     -- id de la cámara en el feed de la DGT; NULL si es manual
    nombre        TEXT             NOT NULL,
    carretera     TEXT,
    ciudad        TEXT             NOT NULL, -- slug de services/ciudades.ts (texto, no enum: añadir ciudad no migra)
    latitud       DOUBLE PRECISION NOT NULL CHECK (latitud BETWEEN -90 AND 90),
    longitud      DOUBLE PRECISION NOT NULL CHECK (longitud BETWEEN -180 AND 180),
    distancia_km  DOUBLE PRECISION,         -- al centro de su ciudad; solo las de la DGT
    url_imagen    TEXT,                     -- JPEG/PNG fijo que el backend proxea
    url_pagina    TEXT,                     -- enlace a la página del directo, si no hay imagen fija
    fuente        TEXT,                     -- atribución de las manuales (las de la DGT son siempre "DGT")
    favorita      BOOLEAN          NOT NULL DEFAULT FALSE,
    visto_en      TIMESTAMP,                -- última vez que apareció en el feed de la DGT
    retirada      BOOLEAN          NOT NULL DEFAULT FALSE, -- la DGT la dejó de publicar
    activo        BOOLEAN          NOT NULL DEFAULT TRUE,
    deleted_at    TIMESTAMP,
    created_at    TIMESTAMP        NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP        NOT NULL DEFAULT NOW(),
    CONSTRAINT camara_tiene_origen_de_imagen CHECK (url_imagen IS NOT NULL OR url_pagina IS NOT NULL)
);

-- Un borrado lógico NO libera la pareja (origen, external_id): una cámara de la
-- DGT que el propietario borró no debe resucitar en la siguiente importación.
CREATE UNIQUE INDEX IF NOT EXISTS idx_camara_origen_external
    ON camara(origen, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_camara_activo_ciudad ON camara(activo, ciudad);

-- Singleton: resultado de la última importación del feed (la UI lo enseña).
CREATE TABLE IF NOT EXISTS importacion_estado (
    id                INTEGER   PRIMARY KEY CHECK (id = 1),
    ultima_ejecucion  TIMESTAMP,
    ultima_ok         BOOLEAN,
    total_feed        INTEGER,
    total_cercanas    INTEGER,
    por_ciudad        JSONB,
    error             TEXT
);
INSERT INTO importacion_estado (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_camara_updated_at ON camara;
CREATE TRIGGER update_camara_updated_at
    BEFORE UPDATE ON camara
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
