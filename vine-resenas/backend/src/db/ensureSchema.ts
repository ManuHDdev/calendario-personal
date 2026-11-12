import { pool } from './pool';

// Idempotent startup schema. `infra/init.sql` only runs when the Postgres
// volume is created from scratch and the monorepo has no migrations, so the
// same statements run here on every start. Keep this identical to
// infra/init.sql (a test compares them).
const TABLES_SQL = `
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
`;

// A product holds at most one video. Kept apart so ensureSchema can dedupe
// legacy rows before creating it.
const VIDEO_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS vine_media_one_video ON vine_media (asin) WHERE type = 'video';
`;

export const SCHEMA_SQL = TABLES_SQL + VIDEO_INDEX_SQL;

// Older versions could end up with several videos for one ASIN (concurrent
// uploads). Keep the newest (highest id) so the unique index can be created.
// Only ROWS are deleted: the files stay on disk (orphans, harmless) because
// removing user media at startup is irreversible; they are logged for cleanup.
const DEDUPE_VIDEOS_SQL = `
DELETE FROM vine_media m USING vine_media n
WHERE m.type = 'video' AND n.type = 'video' AND m.asin = n.asin AND m.id < n.id
RETURNING m.asin, m.filename`;

// Databases created before `en_espera` carry the old inline CHECK (auto-named
// vine_products_estado_check), and CREATE TABLE IF NOT EXISTS never touches an
// existing table. Replace it only when it lacks en_espera, atomically inside one
// DO block (a single statement is a single transaction): the new constraint is a
// superset of the old one, so every existing row stays valid and no data moves.
// init.sql does not need it: a fresh table already has the new CHECK.
export const ESTADO_CONSTRAINT_SQL = `
DO $$
DECLARE c RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'vine_products'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%estado%' AND pg_get_constraintdef(oid) LIKE '%en_espera%'
  ) THEN
    RETURN;
  END IF;
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'vine_products'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%estado%' AND pg_get_constraintdef(oid) LIKE '%pendiente%'
  LOOP
    EXECUTE format('ALTER TABLE vine_products DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE vine_products ADD CONSTRAINT vine_products_estado_check
    CHECK (estado IN ('pendiente', 'listo', 'en_espera', 'resena_generada', 'publicado'));
END
$$;
`;

export async function ensureSchema(): Promise<void> {
  await pool.query(TABLES_SQL);
  await pool.query(ESTADO_CONSTRAINT_SQL);
  const { rows } = await pool.query(DEDUPE_VIDEOS_SQL);
  for (const r of rows as { asin: string; filename: string }[]) {
    console.warn(`ensureSchema: dropped duplicate video row ${r.asin}/${r.filename} (file left on disk)`);
  }
  await pool.query(VIDEO_INDEX_SQL);
}
