-- IMPORTANTE: este fichero SOLO se ejecuta cuando Postgres crea el volumen
-- desde cero. El mismo esquema vive en `backend/src/db/ensureSchema.ts`, que
-- se ejecuta en cada arranque del backend (es lo que cubre un volumen que ya
-- existe). Si tocas uno, toca el otro.

-- Un cruce es un nodo `highway=traffic_signals` de OpenStreetMap. Un cruce
-- tiene varios accesos (cada sentido de llegada tiene su propio semaforo y su
-- propia fase), asi que el estado vive en `acceso`, no aqui.
CREATE TABLE IF NOT EXISTS cruce (
    id          SERIAL           PRIMARY KEY,
    osm_id      BIGINT           NOT NULL UNIQUE,
    ciudad      TEXT             NOT NULL,
    nombre      TEXT             NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    activo      BOOLEAN          NOT NULL DEFAULT TRUE,
    deleted_at  TIMESTAMP,
    created_at  TIMESTAMP        NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP        NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cruce_ciudad ON cruce (ciudad) WHERE activo;

-- Un acceso es un sentido de llegada al cruce: lo que ve un conductor que
-- circula con ese rumbo. `rumbo_grados` es el rumbo de MARCHA (0 = norte).
-- Los *_manual_s son la correccion a mano de la duracion de cada color: si
-- estan rellenos mandan sobre la mediana de lo observado.
CREATE TABLE IF NOT EXISTS acceso (
    id              SERIAL       PRIMARY KEY,
    cruce_id        INTEGER      NOT NULL REFERENCES cruce (id),
    nombre          TEXT         NOT NULL,
    rumbo_grados    SMALLINT     CHECK (rumbo_grados IS NULL OR (rumbo_grados >= 0 AND rumbo_grados < 360)),
    verde_manual_s  NUMERIC(6,1) CHECK (verde_manual_s IS NULL OR verde_manual_s > 0),
    ambar_manual_s  NUMERIC(6,1) CHECK (ambar_manual_s IS NULL OR ambar_manual_s > 0),
    rojo_manual_s   NUMERIC(6,1) CHECK (rojo_manual_s IS NULL OR rojo_manual_s > 0),
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    deleted_at      TIMESTAMP,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_acceso_cruce ON acceso (cruce_id) WHERE activo;

-- Un cambio de color observado: "en `observado_at` este semaforo paso a
-- `color`". Las duraciones se derivan de pares consecutivos, nunca se guardan.
CREATE TABLE IF NOT EXISTS observacion (
    id           SERIAL       PRIMARY KEY,
    acceso_id    INTEGER      NOT NULL REFERENCES acceso (id),
    color        TEXT         NOT NULL CHECK (color IN ('verde', 'ambar', 'rojo')),
    observado_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    activo       BOOLEAN      NOT NULL DEFAULT TRUE,
    deleted_at   TIMESTAMP,
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_observacion_acceso ON observacion (acceso_id, observado_at) WHERE activo;
