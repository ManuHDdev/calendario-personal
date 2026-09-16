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
