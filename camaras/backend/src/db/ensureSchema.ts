import { pool } from './pool';

// Migración idempotente de arranque, mismo patrón que finanzas/watchlist.
// `infra/init.sql` SOLO se ejecuta al crear el volumen de Postgres desde cero;
// este fichero repite el mismo esquema (CREATE ... IF NOT EXISTS) para que una
// base ya existente lo alcance sin intervención manual. Si se toca el esquema,
// hay que tocar los dos ficheros.
export async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS camara (
      id            SERIAL           PRIMARY KEY,
      origen        TEXT             NOT NULL CHECK (origen IN ('dgt', 'manual')),
      external_id   TEXT,
      nombre        TEXT             NOT NULL,
      carretera     TEXT,
      ciudad        TEXT             NOT NULL,
      latitud       DOUBLE PRECISION NOT NULL CHECK (latitud BETWEEN -90 AND 90),
      longitud      DOUBLE PRECISION NOT NULL CHECK (longitud BETWEEN -180 AND 180),
      distancia_km  DOUBLE PRECISION,
      url_imagen    TEXT,
      url_pagina    TEXT,
      fuente        TEXT,
      favorita      BOOLEAN          NOT NULL DEFAULT FALSE,
      visto_en      TIMESTAMP,
      retirada      BOOLEAN          NOT NULL DEFAULT FALSE,
      activo        BOOLEAN          NOT NULL DEFAULT TRUE,
      deleted_at    TIMESTAMP,
      created_at    TIMESTAMP        NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP        NOT NULL DEFAULT NOW(),
      CONSTRAINT camara_tiene_origen_de_imagen CHECK (url_imagen IS NOT NULL OR url_pagina IS NOT NULL)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_camara_origen_external
      ON camara(origen, external_id) WHERE external_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_camara_activo_ciudad ON camara(activo, ciudad);

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
  `);
}
