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
