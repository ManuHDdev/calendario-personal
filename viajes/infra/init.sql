-- Viajes schema. KEEP IN SYNC with backend/src/db/ensureSchema.ts: init.sql only
-- runs when the Postgres volume is created from scratch, the backend re-applies
-- the same idempotent statements on every startup (existing/prod volumes).

CREATE TABLE IF NOT EXISTS trip (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    description TEXT,
    start_date  DATE,
    end_date    DATE,
    owner_keycloak_user_id TEXT,
    activo      BOOLEAN     NOT NULL DEFAULT TRUE,
    deleted_at  TIMESTAMP,
    created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS place (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id      UUID             NOT NULL REFERENCES trip(id),
    type         VARCHAR(12)      NOT NULL
                                  CHECK (type IN ('alojamiento', 'interes', 'comida', 'otro')),
    name         TEXT             NOT NULL,
    lat          DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng          DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
    address      TEXT,
    notes        TEXT,
    url          TEXT,
    cost         NUMERIC(10, 2)   CHECK (cost IS NULL OR cost >= 0),
    visit_date   DATE,
    start_time   TIME,
    duration_min INTEGER          CHECK (duration_min IS NULL OR duration_min > 0),
    check_in     DATE,
    check_out    DATE,
    visited      BOOLEAN          NOT NULL DEFAULT FALSE,
    day_order    INTEGER          NOT NULL DEFAULT 0,
    activo       BOOLEAN          NOT NULL DEFAULT TRUE,
    deleted_at   TIMESTAMP,
    created_at   TIMESTAMP        NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP        NOT NULL DEFAULT NOW()
);

-- Road routes from OSRM, keyed by profile + rounded coordinates.
CREATE TABLE IF NOT EXISTS route_cache (
    cache_key  TEXT PRIMARY KEY,
    result     JSONB     NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Nominatim answers (search + reverse), keyed by normalised query.
CREATE TABLE IF NOT EXISTS geocode_cache (
    cache_key  TEXT PRIMARY KEY,
    results    JSONB     NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION viajes_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trip_set_updated_at ON trip;
CREATE TRIGGER trip_set_updated_at BEFORE UPDATE ON trip
    FOR EACH ROW EXECUTE FUNCTION viajes_set_updated_at();

DROP TRIGGER IF EXISTS place_set_updated_at ON place;
CREATE TRIGGER place_set_updated_at BEFORE UPDATE ON place
    FOR EACH ROW EXECUTE FUNCTION viajes_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_place_trip_id ON place(trip_id);
CREATE INDEX IF NOT EXISTS idx_place_trip_date ON place(trip_id, visit_date);
