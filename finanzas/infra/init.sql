-- Histórico de precio medio de vivienda libre (€/m²) por ámbito, importado
-- periódicamente del Ministerio de Transportes.
CREATE TABLE IF NOT EXISTS precio_vivienda (
  id SERIAL PRIMARY KEY,
  ambito TEXT NOT NULL CHECK (ambito IN ('nacional', 'ccaa', 'provincia')),
  nombre TEXT NOT NULL,
  comunidad_autonoma TEXT,
  anio INTEGER NOT NULL,
  trimestre INTEGER NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
  precio_m2 NUMERIC(10,2),
  actualizado_en TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (ambito, nombre, anio, trimestre)
);

CREATE INDEX IF NOT EXISTS idx_precio_vivienda_nombre ON precio_vivienda (nombre);

-- Estado singleton de la última importación (patrón `scraper_state` de pisos).
CREATE TABLE IF NOT EXISTS importacion_estado (
  id INTEGER PRIMARY KEY DEFAULT 1,
  ultima_ejecucion TIMESTAMP,
  ultima_ejecucion_ok BOOLEAN,
  filas_importadas INTEGER,
  error TEXT,
  CONSTRAINT importacion_estado_singleton CHECK (id = 1)
);

INSERT INTO importacion_estado (id, ultima_ejecucion, ultima_ejecucion_ok, filas_importadas, error)
VALUES (1, NULL, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Precio medio de vivienda por CAPITAL de provincia, de anuncios reales de
-- Fotocasa/pisos.com (precio de OFERTA, no oficial) — complementa
-- precio_vivienda, que es por provincia y viene del XLS del Ministerio.
--
-- OJO: este fichero solo se ejecuta cuando Postgres crea el volumen de datos
-- por primera vez. El contenedor finanzas-db de producción ya existe, así
-- que estas mismas sentencias se repiten en
-- backend/src/services/ensureSchemaCapitales.ts (ejecutado en cada arranque
-- del backend) para que también converjan ahí. Si se toca este bloque, tocar
-- también ese fichero.
CREATE TABLE IF NOT EXISTS precio_vivienda_capital (
  id SERIAL PRIMARY KEY,
  capital TEXT NOT NULL,
  provincia TEXT NOT NULL,
  portal TEXT NOT NULL,
  fecha_captura DATE NOT NULL,
  precio_m2_medio NUMERIC(10,2) NOT NULL,
  num_anuncios INTEGER NOT NULL,
  actualizado_en TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (capital, portal, fecha_captura)
);
CREATE INDEX IF NOT EXISTS idx_precio_vivienda_capital_capital ON precio_vivienda_capital (capital);

-- Estado singleton del scraper de capitales (mismo patrón que importacion_estado).
CREATE TABLE IF NOT EXISTS capital_scraper_estado (
  id INTEGER PRIMARY KEY DEFAULT 1,
  ultima_ejecucion TIMESTAMP,
  ultima_ejecucion_ok BOOLEAN,
  capitales_ok INTEGER,
  capitales_fallidas INTEGER,
  error TEXT,
  CONSTRAINT capital_scraper_estado_singleton CHECK (id = 1)
);
INSERT INTO capital_scraper_estado (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Alquiler turístico (estilo Airbnb): precio, ocupación estimada y
-- características por anuncio, importado trimestralmente de Inside Airbnb
-- (insideairbnb.com, licencia CC BY 4.0) para las 9 zonas de España que
-- cubre. Complementa (no sustituye) precio_vivienda/precio_vivienda_capital,
-- que son mercado de COMPRA/alquiler de larga duración — este es el mercado
-- de alquiler turístico de corta estancia.
--
-- OJO: mismo aviso que precio_vivienda_capital más arriba — el contenedor
-- finanzas-db de producción ya existe, así que estas sentencias se repiten
-- en backend/src/services/ensureSchemaAirbnb.ts (ejecutado en cada arranque
-- del backend). Si se toca este bloque, tocar también ese fichero.
--
-- `listing_id` es TEXT, nunca INTEGER/BIGINT: algunos ids de Airbnb superan
-- Number.MAX_SAFE_INTEGER (verificado en vivo, ids de 19 dígitos) y aquí
-- solo se usan como clave opaca, nunca en aritmética.
CREATE TABLE IF NOT EXISTS alquiler_turistico_listing (
  listing_id TEXT NOT NULL,
  ciudad TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  nombre TEXT,
  barrio_grupo TEXT,
  barrio TEXT,
  latitud DOUBLE PRECISION,
  longitud DOUBLE PRECISION,
  tipo_habitacion TEXT,
  precio_noche NUMERIC,
  estancia_minima_noches INTEGER,
  num_resenas INTEGER,
  resenas_ultimos_12_meses INTEGER,
  resenas_por_mes NUMERIC,
  ultima_resena DATE,
  anuncios_del_anfitrion INTEGER,
  disponibilidad_365 INTEGER,
  actualizado_en TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (listing_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_alquiler_turistico_ciudad_fecha ON alquiler_turistico_listing (ciudad, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_alquiler_turistico_barrio ON alquiler_turistico_listing (ciudad, barrio);

-- Estado singleton del importador de alquiler turístico (mismo patrón que
-- importacion_estado/capital_scraper_estado).
CREATE TABLE IF NOT EXISTS alquiler_turistico_estado (
  id INTEGER PRIMARY KEY DEFAULT 1,
  ultima_ejecucion TIMESTAMP,
  ultima_ejecucion_ok BOOLEAN,
  filas_importadas INTEGER,
  error TEXT,
  CONSTRAINT alquiler_turistico_estado_singleton CHECK (id = 1)
);
INSERT INTO alquiler_turistico_estado (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
