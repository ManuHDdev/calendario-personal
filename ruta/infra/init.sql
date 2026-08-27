-- Busquedas guardadas: un trayecto + que buscar en el.
CREATE TABLE IF NOT EXISTS busqueda_ruta (
    id              SERIAL           PRIMARY KEY,
    nombre          TEXT             NOT NULL,
    origen_texto    TEXT             NOT NULL,
    origen_lat      DOUBLE PRECISION NOT NULL,
    origen_lng      DOUBLE PRECISION NOT NULL,
    destino_texto   TEXT             NOT NULL,
    destino_lat     DOUBLE PRECISION NOT NULL,
    destino_lng     DOUBLE PRECISION NOT NULL,
    keyword         TEXT             NOT NULL,
    desvio_max_km   DOUBLE PRECISION NOT NULL CHECK (desvio_max_km > 0 AND desvio_max_km <= 50),
    min_price       NUMERIC(10, 2),
    max_price       NUMERIC(10, 2),
    excluir_palabras TEXT,
    activo          BOOLEAN          NOT NULL DEFAULT TRUE,
    deleted_at      TIMESTAMP,
    created_at      TIMESTAMP        NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP        NOT NULL DEFAULT NOW(),
    CONSTRAINT precio_coherente CHECK (
        min_price IS NULL OR max_price IS NULL OR min_price <= max_price
    )
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_busqueda_ruta_updated_at
    BEFORE UPDATE ON busqueda_ruta
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_busqueda_ruta_activo ON busqueda_ruta(activo);

-- Cache permanente de geocodificacion.
--
-- Nominatim es un servicio gratuito y compartido cuya politica de uso pide no
-- repetir consultas ya resueltas. Cachear aqui (y no en memoria) hace que un
-- lugar se consulte UNA sola vez en la vida del despliegue, sobreviviendo a
-- reinicios y redespliegues del contenedor.
CREATE TABLE IF NOT EXISTS geocode_cache (
    consulta     TEXT             PRIMARY KEY,
    latitud      DOUBLE PRECISION NOT NULL,
    longitud     DOUBLE PRECISION NOT NULL,
    display_name TEXT             NOT NULL,
    created_at   TIMESTAMP        NOT NULL DEFAULT NOW()
);
