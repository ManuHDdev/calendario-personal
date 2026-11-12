-- Vine reviews. Idempotent: the monorepo has no migration framework.
-- This file only runs when the Postgres volume is created from scratch; the
-- backend applies the very same statements on every start
-- (backend/src/db/ensureSchema.ts). Keep both identical.

CREATE TABLE IF NOT EXISTS vine_products (
  asin             VARCHAR(10) PRIMARY KEY,
  titulo           TEXT NOT NULL DEFAULT '',
  descripcion      TEXT NOT NULL DEFAULT '',
  feedback         TEXT NOT NULL DEFAULT '',
  estrellas        SMALLINT CHECK (estrellas BETWEEN 1 AND 5),
  estado           TEXT NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente', 'listo', 'en_espera', 'resena_generada', 'publicado')),
  resena_producto  TEXT NOT NULL DEFAULT '',
  resena_resumida  TEXT NOT NULL DEFAULT '',
  resena_extendida TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vine_media (
  id         SERIAL PRIMARY KEY,
  asin       VARCHAR(10) NOT NULL REFERENCES vine_products(asin) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('photo', 'video')),
  size       BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (asin, filename)
);

CREATE INDEX IF NOT EXISTS idx_vine_media_asin ON vine_media (asin);
CREATE INDEX IF NOT EXISTS idx_vine_products_estado ON vine_products (estado);

CREATE TABLE IF NOT EXISTS vine_guest_links (
  id           SERIAL PRIMARY KEY,
  asin         VARCHAR(10) NOT NULL REFERENCES vine_products(asin) ON DELETE CASCADE,
  token_hash   CHAR(64) NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  created_by   TEXT,
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vine_guest_links_asin ON vine_guest_links (asin);

ALTER TABLE vine_products ADD COLUMN IF NOT EXISTS guest_feedback TEXT NOT NULL DEFAULT '';
ALTER TABLE vine_media ADD COLUMN IF NOT EXISTS uploaded_via_guest_link_id INTEGER REFERENCES vine_guest_links(id);

CREATE UNIQUE INDEX IF NOT EXISTS vine_media_one_video ON vine_media (asin) WHERE type = 'video';
