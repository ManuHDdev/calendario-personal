-- ─────────────────────────────────────────────────────────────────────────────
-- Pisos — rastreador de anuncios de vivienda en venta.
--
-- Dos tablas de datos y un singleton de estado:
--   busqueda      → los criterios que el propietario quiere vigilar
--   anuncio       → cada anuncio visto por el rastreador, por busqueda
--   scraper_state → on/off global del rastreador (mismo patrón que ofertas)
--
-- Regla global del monorepo: borrado lógico (activo + deleted_at) en todas
-- las tablas de datos; los listados filtran siempre por activo = true.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS busqueda (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre              TEXT            NOT NULL,

    -- Texto libre de la zona ("Badajoz", "Madrid", "Getafe"). Cada portal lo
    -- convierte a su propio formato de URL/parámetro; no es un identificador
    -- compartido entre portales.
    ubicacion           TEXT            NOT NULL,

    -- Coordenadas del centro de búsqueda. Solo las usa el portal de Wallapop,
    -- que busca por radio y no por zona con nombre. Si vienen a NULL, ese
    -- portal se salta con un aviso en lugar de inventarse un centro: un
    -- rastreo parcial nunca debe parecerse a uno completo.
    latitud             NUMERIC(10, 7),
    longitud            NUMERIC(10, 7),
    radio_km            NUMERIC(6, 2),

    precio_min          NUMERIC(12, 2),
    precio_max          NUMERIC(12, 2),
    metros_min          INTEGER,
    metros_max          INTEGER,
    habitaciones_min    INTEGER,
    banos_min           INTEGER,

    -- Requisitos duros: TRUE = el anuncio debe tenerlo. Un anuncio en el que
    -- el portal no informa del dato NO se descarta por estos filtros (ver
    -- services/criterios.ts): la mayoría de portales omiten el extra en el
    -- listado y solo lo muestran en la ficha, así que tratar "desconocido"
    -- como "no lo tiene" perdería pisos válidos en silencio.
    exige_ascensor      BOOLEAN         NOT NULL DEFAULT FALSE,
    exige_garaje        BOOLEAN         NOT NULL DEFAULT FALSE,
    exige_terraza       BOOLEAN         NOT NULL DEFAULT FALSE,

    -- Términos separados por coma; si el título o la ubicación contienen
    -- alguno, el anuncio se descarta (p. ej. "subasta,okupa,nuda propiedad").
    excluir_palabras    TEXT,

    -- {"fotocasa": {"enabled": true}, "pisos": {...}, "wallapop": {...}}
    portales            JSONB           NOT NULL,

    -- Pausa una búsqueda concreta sin borrarla ni tocar el on/off global.
    habilitada          BOOLEAN         NOT NULL DEFAULT TRUE,
    -- Si es FALSE, la búsqueda sigue rastreándose pero no manda Telegram.
    notificar           BOOLEAN         NOT NULL DEFAULT TRUE,

    ultimo_rastreo_at   TIMESTAMP,
    ultimo_rastreo_error TEXT,

    activo              BOOLEAN         NOT NULL DEFAULT TRUE,
    deleted_at          TIMESTAMP,
    created_at          TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP       NOT NULL DEFAULT NOW(),

    CONSTRAINT precio_coherente CHECK (
        precio_min IS NULL OR precio_max IS NULL OR precio_min <= precio_max
    ),
    CONSTRAINT metros_coherentes CHECK (
        metros_min IS NULL OR metros_max IS NULL OR metros_min <= metros_max
    ),
    -- O están las tres coordenadas o ninguna: un centro sin radio (o al revés)
    -- no describe ninguna zona buscable.
    CONSTRAINT zona_wallapop_completa CHECK (
        (latitud IS NULL AND longitud IS NULL AND radio_km IS NULL)
        OR (latitud IS NOT NULL AND longitud IS NOT NULL AND radio_km IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS anuncio (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    busqueda_id         UUID            NOT NULL REFERENCES busqueda(id) ON DELETE CASCADE,

    portal              TEXT            NOT NULL,
    -- Identificador del anuncio DENTRO de su portal. La unicidad es por
    -- (busqueda, portal, id): el mismo piso puede encajar en dos búsquedas
    -- distintas y cada una lleva su propio estado de visto/descartado.
    portal_id           TEXT            NOT NULL,

    url                 TEXT            NOT NULL,
    titulo              TEXT            NOT NULL,
    precio              NUMERIC(12, 2),
    -- Precio la primera vez que se vio, y precio justo antes del último
    -- cambio. Entre los dos permiten avisar de una bajada ("antes 145.000")
    -- y ver la caída total desde la publicación, sin tabla de histórico.
    precio_inicial      NUMERIC(12, 2),
    precio_previo       NUMERIC(12, 2),
    metros              INTEGER,
    habitaciones        INTEGER,
    banos               INTEGER,
    planta              TEXT,
    -- NULL = el portal no informa del dato. Distinto de FALSE ("no lo tiene").
    ascensor            BOOLEAN,
    garaje              BOOLEAN,
    terraza             BOOLEAN,
    ubicacion           TEXT,
    latitud             NUMERIC(10, 7),
    longitud            NUMERIC(10, 7),
    imagen_url          TEXT,

    visto               BOOLEAN         NOT NULL DEFAULT FALSE,
    descartado          BOOLEAN         NOT NULL DEFAULT FALSE,
    notificado_at       TIMESTAMP,
    -- Última vez que el rastreador volvió a ver el anuncio publicado. Un
    -- anuncio que lleva días sin aparecer probablemente ya está vendido.
    visto_ultima_vez_at TIMESTAMP       NOT NULL DEFAULT NOW(),

    activo              BOOLEAN         NOT NULL DEFAULT TRUE,
    deleted_at          TIMESTAMP,
    created_at          TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP       NOT NULL DEFAULT NOW(),

    CONSTRAINT anuncio_unico_por_busqueda UNIQUE (busqueda_id, portal, portal_id)
);

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

CREATE TRIGGER update_anuncio_updated_at
    BEFORE UPDATE ON anuncio
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_busqueda_activo ON busqueda(activo);
CREATE INDEX IF NOT EXISTS idx_busqueda_activo_habilitada ON busqueda(activo, habilitada);

CREATE INDEX IF NOT EXISTS idx_anuncio_busqueda ON anuncio(busqueda_id, activo);
-- El feed por defecto es "novedades primero": activos, no descartados,
-- ordenados por fecha de alta.
CREATE INDEX IF NOT EXISTS idx_anuncio_novedades ON anuncio(activo, descartado, created_at DESC);

-- On/off global del rastreador. Fila única forzada por el CHECK.
CREATE TABLE IF NOT EXISTS scraper_state (
    id          INT         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    running     BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_at  TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_scraper_state_updated_at
    BEFORE UPDATE ON scraper_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO scraper_state (id, running)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;
