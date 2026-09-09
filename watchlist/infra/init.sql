CREATE TABLE IF NOT EXISTS item (
    id              SERIAL          PRIMARY KEY,
    tipo            TEXT            NOT NULL CHECK (tipo IN ('pelicula', 'serie', 'libro')),
    external_id     TEXT,                     -- id de TMDB o volumeId de Google Books; NULL si es manual
    fuente          TEXT            CHECK (fuente IN ('tmdb', 'google_books', 'manual')),
    titulo          TEXT            NOT NULL,
    autor           TEXT,                     -- solo libros
    poster_url      TEXT,
    sinopsis        TEXT,
    estado          TEXT            NOT NULL DEFAULT 'pendiente'
                                     CHECK (estado IN ('pendiente', 'en_curso', 'completado')),
    nota            TEXT,
    rating          SMALLINT        CHECK (rating BETWEEN 1 AND 5),
    activo          BOOLEAN         NOT NULL DEFAULT TRUE,
    deleted_at      TIMESTAMP,
    created_at      TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_item_updated_at
    BEFORE UPDATE ON item
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_item_activo ON item(activo);
CREATE INDEX IF NOT EXISTS idx_item_tipo ON item(tipo);
CREATE INDEX IF NOT EXISTS idx_item_estado ON item(estado);
CREATE INDEX IF NOT EXISTS idx_item_activo_tipo_estado ON item(activo, tipo, estado);

-- Evita añadir el mismo título dos veces por error, pero permite volver a
-- añadirlo tras un borrado lógico (el índice solo cubre filas activas).
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_external_unique
    ON item(tipo, external_id) WHERE activo = true AND external_id IS NOT NULL;

-- ── External API usage counters (see openspec add-api-usage-dashboard) ───

CREATE TABLE IF NOT EXISTS api_usage_counter (
    api_name    TEXT    NOT NULL,
    usage_date  DATE    NOT NULL,
    calls       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (api_name, usage_date)
);
