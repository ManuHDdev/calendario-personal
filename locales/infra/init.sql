-- Locales — rastreador de locales comerciales y farmacias en venta,
-- con verificación de distancia peatonal a farmacias y centros sanitarios.
--
-- Idempotente: es el único mecanismo de esquema del monorepo (no hay
-- framework de migraciones). Se monta en el contenedor de Postgres y puede
-- reejecutarse sin efectos.

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Geografía administrativa
--
-- La unidad legal de la ordenación farmacéutica es la COMUNIDAD AUTÓNOMA: las
-- distancias mínimas las fija cada una. Pero se busca por provincia, así que
-- hace falta el mapeo para saber qué normativa aplicar a cada búsqueda.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS provincia (
  codigo      TEXT PRIMARY KEY,           -- código INE de 2 dígitos
  nombre      TEXT NOT NULL,
  comunidad   TEXT NOT NULL,              -- clave hacia normativa.comunidad
  costera     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provincia_comunidad ON provincia (comunidad);
CREATE INDEX IF NOT EXISTS idx_provincia_costera   ON provincia (costera) WHERE costera;

-- ---------------------------------------------------------------------------
-- Normativa: las distancias son DATO, no constantes en el código.
--
-- Una fila con zona_excepcion NULL es la regla general de esa comunidad.
-- Una fila con zona_excepcion poblada es una excepción territorial dentro de
-- ella (p. ej. las zonas farmacéuticas turísticas de Canarias, 1.000 m).
--
-- distancia_centros_sanitarios_m NULL significa "esta comunidad no impone esa
-- distancia (o no está verificada)", NUNCA "cero metros".
--
-- `verificado` distingue lo comprobado contra la ley autonómica concreta de lo
-- que solo hereda el mínimo estatal de la Ley 16/1997. La UI lo muestra: es la
-- diferencia entre un dato en el que fiarse y uno que hay que confirmar.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS normativa (
  id                              SERIAL PRIMARY KEY,
  comunidad                       TEXT NOT NULL,
  zona_excepcion                  TEXT,
  distancia_farmacias_m           INTEGER NOT NULL DEFAULT 250 CHECK (distancia_farmacias_m > 0),
  distancia_centros_sanitarios_m  INTEGER CHECK (distancia_centros_sanitarios_m > 0),
  verificado                      BOOLEAN NOT NULL DEFAULT FALSE,
  fuente_url                      TEXT,
  notas                           TEXT,
  activo                          BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at                      TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Una única regla general por comunidad, y una única fila por zona de excepción.
CREATE UNIQUE INDEX IF NOT EXISTS idx_normativa_general
  ON normativa (comunidad) WHERE zona_excepcion IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_normativa_excepcion
  ON normativa (comunidad, zona_excepcion) WHERE zona_excepcion IS NOT NULL;

DROP TRIGGER IF EXISTS trg_normativa_updated_at ON normativa;
CREATE TRIGGER trg_normativa_updated_at BEFORE UPDATE ON normativa
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Padrón de farmacias y centros sanitarios
--
-- Se importa de varias fuentes y se fusiona por proximidad. `fuente` +
-- `fuente_id` es la identidad estable dentro de su origen; `visto_en` es la
-- última vez que la fuente lo sirvió, y es lo que permite dar de baja por
-- ausencia (soft delete) sin perder el histórico.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS farmacia (
  id                     SERIAL PRIMARY KEY,
  fuente                 TEXT NOT NULL,          -- 'osm' | 'oficial_madrid' | ...
  fuente_id              TEXT NOT NULL,
  nombre                 TEXT,
  direccion              TEXT,
  municipio              TEXT,
  provincia              TEXT,
  comunidad              TEXT,
  latitud                DOUBLE PRECISION NOT NULL,
  longitud               DOUBLE PRECISION NOT NULL,
  precision_coordenadas  TEXT NOT NULL DEFAULT 'desconocida'
                           CHECK (precision_coordenadas IN ('exacta','aproximada','desconocida')),
  -- Cuando dos fuentes describen la misma farmacia, la de menor confianza
  -- apunta aquí a la fila que se conserva, en vez de desaparecer.
  duplicado_de_id        INTEGER REFERENCES farmacia (id),
  visto_en               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activo                 BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fuente, fuente_id)
);

CREATE INDEX IF NOT EXISTS idx_farmacia_bbox      ON farmacia (latitud, longitud) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_farmacia_municipio ON farmacia (municipio) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_farmacia_comunidad ON farmacia (comunidad) WHERE activo;

DROP TRIGGER IF EXISTS trg_farmacia_updated_at ON farmacia;
CREATE TRIGGER trg_farmacia_updated_at BEFORE UPDATE ON farmacia
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS centro_sanitario (
  id                     SERIAL PRIMARY KEY,
  fuente                 TEXT NOT NULL,
  fuente_id              TEXT NOT NULL,
  tipo                   TEXT NOT NULL DEFAULT 'primaria'
                           CHECK (tipo IN ('primaria','especializada','hospital')),
  nombre                 TEXT,
  direccion              TEXT,
  municipio              TEXT,
  provincia              TEXT,
  comunidad              TEXT,
  latitud                DOUBLE PRECISION NOT NULL,
  longitud               DOUBLE PRECISION NOT NULL,
  precision_coordenadas  TEXT NOT NULL DEFAULT 'desconocida'
                           CHECK (precision_coordenadas IN ('exacta','aproximada','desconocida')),
  duplicado_de_id        INTEGER REFERENCES centro_sanitario (id),
  visto_en               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activo                 BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fuente, fuente_id)
);

CREATE INDEX IF NOT EXISTS idx_centro_bbox      ON centro_sanitario (latitud, longitud) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_centro_municipio ON centro_sanitario (municipio) WHERE activo;

DROP TRIGGER IF EXISTS trg_centro_updated_at ON centro_sanitario;
CREATE TRIGGER trg_centro_updated_at BEFORE UPDATE ON centro_sanitario
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Cobertura del padrón
--
-- Un falso verde solo puede venir de una farmacia que existe y no está en el
-- padrón. Esta tabla es el mecanismo que impide emitirlo: si un municipio
-- tiene mucho menos de lo que le tocaría por población, sus verdes se degradan
-- a ámbar.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cobertura_municipio (
  id                   SERIAL PRIMARY KEY,
  municipio            TEXT NOT NULL,
  provincia            TEXT,
  farmacias_conocidas  INTEGER NOT NULL DEFAULT 0,
  poblacion            INTEGER,
  farmacias_esperadas  INTEGER,
  suficiente           BOOLEAN NOT NULL DEFAULT FALSE,
  motivo               TEXT,
  calculado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (municipio, provincia)
);

-- ---------------------------------------------------------------------------
-- Búsquedas guardadas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS busqueda (
  id                              SERIAL PRIMARY KEY,
  nombre                          TEXT NOT NULL,
  tipo                            TEXT NOT NULL CHECK (tipo IN ('local','farmacia')),

  -- Geografía
  comunidad                       TEXT,
  provincia                       TEXT,
  municipio                       TEXT,
  zona_texto                      TEXT,        -- lo que entienden Fotocasa/pisos.com
  latitud                         DOUBLE PRECISION,
  longitud                        DOUBLE PRECISION,
  radio_km                        INTEGER,

  -- Criterios de local comercial
  precio_min                      NUMERIC(12,2),
  precio_max                      NUMERIC(12,2),
  superficie_min                  INTEGER,
  superficie_max                  INTEGER,
  pie_calle                       BOOLEAN,     -- NULL = indiferente

  -- Criterios de farmacia en venta
  facturacion_min                 NUMERIC(12,2),
  facturacion_max                 NUMERIC(12,2),

  -- Viabilidad: qué normativa aplicar y con qué umbrales.
  -- NULL en los umbrales = heredar los de la comunidad de la búsqueda.
  comprobar_farmacias             BOOLEAN NOT NULL DEFAULT TRUE,
  comprobar_centros_sanitarios    BOOLEAN NOT NULL DEFAULT TRUE,
  distancia_farmacias_m           INTEGER CHECK (distancia_farmacias_m > 0),
  distancia_centros_sanitarios_m  INTEGER CHECK (distancia_centros_sanitarios_m > 0),

  portales                        TEXT[] NOT NULL DEFAULT '{}',
  ultimo_rastreo                  TIMESTAMPTZ,
  ultimo_rastreo_error            TEXT,

  activo                          BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at                      TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_busqueda_activa ON busqueda (activo) WHERE activo;

DROP TRIGGER IF EXISTS trg_busqueda_updated_at ON busqueda;
CREATE TRIGGER trg_busqueda_updated_at BEFORE UPDATE ON busqueda
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Anuncios
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS anuncio (
  id                      SERIAL PRIMARY KEY,
  busqueda_id             INTEGER NOT NULL REFERENCES busqueda (id),
  tipo                    TEXT NOT NULL CHECK (tipo IN ('local','farmacia')),

  portal                  TEXT NOT NULL,
  portal_id               TEXT NOT NULL,
  url                     TEXT NOT NULL,

  titulo                  TEXT,
  descripcion             TEXT,
  precio                  NUMERIC(12,2),
  precio_anterior         NUMERIC(12,2),
  superficie_m2           INTEGER,
  facturacion             NUMERIC(12,2),
  imagen_url              TEXT,

  direccion               TEXT,
  municipio               TEXT,
  provincia               TEXT,
  comunidad               TEXT,
  latitud                 DOUBLE PRECISION,
  longitud                DOUBLE PRECISION,
  precision_coordenadas   TEXT NOT NULL DEFAULT 'desconocida'
                            CHECK (precision_coordenadas IN ('exacta','aproximada','desconocida')),

  -- Resultado de viabilidad
  veredicto               TEXT NOT NULL DEFAULT 'sin_datos'
                            CHECK (veredicto IN ('verde','ambar','rojo','sin_datos')),
  veredicto_motivo        TEXT,
  distancia_farmacia_m    INTEGER,
  farmacia_mas_cercana_id INTEGER REFERENCES farmacia (id),
  distancia_centro_m      INTEGER,
  centro_mas_cercano_id   INTEGER REFERENCES centro_sanitario (id),
  viabilidad_calculada_en TIMESTAMPTZ,
  viabilidad_motor        TEXT,

  visto                   BOOLEAN NOT NULL DEFAULT FALSE,
  descartado              BOOLEAN NOT NULL DEFAULT FALSE,
  notificado              BOOLEAN NOT NULL DEFAULT FALSE,

  activo                  BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portal, portal_id)
);

CREATE INDEX IF NOT EXISTS idx_anuncio_busqueda  ON anuncio (busqueda_id) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_anuncio_veredicto ON anuncio (veredicto)   WHERE activo;
CREATE INDEX IF NOT EXISTS idx_anuncio_nuevos    ON anuncio (visto)       WHERE activo AND NOT visto;
-- Filas cuya viabilidad hay que recalcular (motor cambiado o nunca calculada).
CREATE INDEX IF NOT EXISTS idx_anuncio_motor     ON anuncio (viabilidad_motor) WHERE activo;

DROP TRIGGER IF EXISTS trg_anuncio_updated_at ON anuncio;
CREATE TRIGGER trg_anuncio_updated_at BEFORE UPDATE ON anuncio
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Cachés y estado
-- ---------------------------------------------------------------------------

-- Mismo contrato que ruta/geocode_cache: una consulta se resuelve una vez.
CREATE TABLE IF NOT EXISTS geocode_cache (
  consulta      TEXT PRIMARY KEY,
  latitud       DOUBLE PRECISION NOT NULL,
  longitud      DOUBLE PRECISION NOT NULL,
  display_name  TEXT NOT NULL,
  -- Nominatim dice qué encontró (house/building vs road/city); de ahí sale si
  -- la coordenada vale para decidir a 250 m o solo para situar en el mapa.
  precision_coordenadas TEXT NOT NULL DEFAULT 'desconocida'
                          CHECK (precision_coordenadas IN ('exacta','aproximada','desconocida')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Caché permanente de distancias peatonales. La red de aceras y las farmacias
-- se mueven en años, no en minutos: no hay TTL a propósito.
CREATE TABLE IF NOT EXISTS ruta_cache (
  origen_geo   TEXT NOT NULL,   -- lat,lng redondeados a ~10 m
  destino_geo  TEXT NOT NULL,
  motor        TEXT NOT NULL,
  metros       INTEGER,         -- NULL = el motor no encontró ruta peatonal
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (origen_geo, destino_geo, motor)
);

-- Presupuesto diario de peticiones al motor de rutas (relevante con ORS).
CREATE TABLE IF NOT EXISTS presupuesto_rutas (
  dia         DATE NOT NULL,
  motor       TEXT NOT NULL,
  peticiones  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, motor)
);

CREATE TABLE IF NOT EXISTS scraper_state (
  id          BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  running     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO scraper_state (id, running) VALUES (TRUE, TRUE) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Siembra: provincias
--
-- Las 50 provincias + Ceuta y Melilla, con su comunidad autónoma y si tienen
-- costa. `costera` existe porque el interés declarado son plazas de costa, y
-- permite filtrar sin mantener una lista a mano en el frontend.
-- ---------------------------------------------------------------------------

INSERT INTO provincia (codigo, nombre, comunidad, costera) VALUES
  ('04','Almería','andalucia',TRUE),      ('11','Cádiz','andalucia',TRUE),
  ('14','Córdoba','andalucia',FALSE),     ('18','Granada','andalucia',TRUE),
  ('21','Huelva','andalucia',TRUE),       ('23','Jaén','andalucia',FALSE),
  ('29','Málaga','andalucia',TRUE),       ('41','Sevilla','andalucia',FALSE),
  ('22','Huesca','aragon',FALSE),         ('44','Teruel','aragon',FALSE),
  ('50','Zaragoza','aragon',FALSE),
  ('33','Asturias','asturias',TRUE),
  ('07','Illes Balears','baleares',TRUE),
  ('35','Las Palmas','canarias',TRUE),    ('38','Santa Cruz de Tenerife','canarias',TRUE),
  ('39','Cantabria','cantabria',TRUE),
  ('05','Ávila','castilla-leon',FALSE),   ('09','Burgos','castilla-leon',FALSE),
  ('24','León','castilla-leon',FALSE),    ('34','Palencia','castilla-leon',FALSE),
  ('37','Salamanca','castilla-leon',FALSE),('40','Segovia','castilla-leon',FALSE),
  ('42','Soria','castilla-leon',FALSE),   ('47','Valladolid','castilla-leon',FALSE),
  ('49','Zamora','castilla-leon',FALSE),
  ('02','Albacete','castilla-mancha',FALSE),('13','Ciudad Real','castilla-mancha',FALSE),
  ('16','Cuenca','castilla-mancha',FALSE),('19','Guadalajara','castilla-mancha',FALSE),
  ('45','Toledo','castilla-mancha',FALSE),
  ('08','Barcelona','cataluna',TRUE),     ('17','Girona','cataluna',TRUE),
  ('25','Lleida','cataluna',FALSE),       ('43','Tarragona','cataluna',TRUE),
  ('03','Alicante','valenciana',TRUE),    ('12','Castellón','valenciana',TRUE),
  ('46','Valencia','valenciana',TRUE),
  ('06','Badajoz','extremadura',FALSE),   ('10','Cáceres','extremadura',FALSE),
  ('15','A Coruña','galicia',TRUE),       ('27','Lugo','galicia',TRUE),
  ('32','Ourense','galicia',FALSE),       ('36','Pontevedra','galicia',TRUE),
  ('28','Madrid','madrid',FALSE),
  ('30','Murcia','murcia',TRUE),
  ('31','Navarra','navarra',FALSE),
  ('01','Álava','pais-vasco',FALSE),      ('20','Gipuzkoa','pais-vasco',TRUE),
  ('48','Bizkaia','pais-vasco',TRUE),
  ('26','La Rioja','rioja',FALSE),
  ('51','Ceuta','ceuta',TRUE),            ('52','Melilla','melilla',TRUE)
ON CONFLICT (codigo) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      comunidad = EXCLUDED.comunidad,
      costera = EXCLUDED.costera;

-- ---------------------------------------------------------------------------
-- Siembra: normativa
--
-- El mínimo estatal son 250 m (Ley 16/1997, art. 3.1), y las comunidades
-- pueden endurecerlo o rebajarlo. Se siembran las 17 comunidades + Ceuta y
-- Melilla con ese 250 por defecto.
--
-- `verificado = TRUE` solo en las comprobadas contra su norma autonómica
-- concreta. En el resto, 250 m es el mínimo estatal heredado y hay que
-- confirmarlo antes de fiarse — la UI lo marca en vez de aparentar certeza.
--
-- La distancia a centros sanitarios NO es general: se deja NULL salvo donde
-- está verificada. NULL = no se comprueba, no "cero metros".
-- ---------------------------------------------------------------------------

INSERT INTO normativa
  (comunidad, zona_excepcion, distancia_farmacias_m, distancia_centros_sanitarios_m, verificado, fuente_url, notas)
VALUES
  ('madrid', NULL, 250, 150, TRUE,
   'https://www.boe.es/buscar/act.php?id=BOE-A-2023-13539',
   'Ley 13/2022 de Ordenación y Atención Farmacéutica de la Comunidad de Madrid (deroga la Ley 19/1998). 250 m entre farmacias y 150 m a centros de atención primaria o especializada. El método exacto de medición lo fija el reglamento.'),
  ('andalucia', NULL, 250, NULL, TRUE,
   'https://www.cacof.es/actualidad/noticias/la-junta-de-andalucia-fija-en-250-metros-la-distancia-minima-entre-oficinas-de-farmacia/',
   'La Junta fija 250 m entre oficinas de farmacia.'),
  ('valenciana', NULL, 250, NULL, TRUE,
   'https://www.boe.es/buscar/act.php?id=BOE-A-1997-9022',
   '250 m entre farmacias.'),
  ('baleares', NULL, 250, NULL, TRUE,
   'https://www.boe.es/buscar/act.php?id=BOE-A-1997-9022',
   'La norma balear fija 250 m "medidos por el camino vial más corto" — es la formulación más explícita de que la medición NO es en línea recta.'),
  ('canarias', NULL, 250, NULL, TRUE,
   'https://www.boe.es/buscar/act.php?id=BOE-A-1997-9022',
   '250 m con carácter general. Ver la fila de excepción para zonas turísticas.'),
  ('canarias', 'zona farmacéutica turística de tipo común', 1000, NULL, TRUE,
   'https://www.boe.es/buscar/act.php?id=BOE-A-1997-9022',
   'En zonas farmacéuticas especiales o turísticas de tipo común la distancia sube a 1.000 m. Aplicarla exige saber si el municipio está clasificado así: confirmar antes de fiarse de un verde en Canarias.'),
  ('aragon',          NULL, 250, NULL, FALSE, 'https://www.boe.es/buscar/act.php?id=BOE-A-1997-9022', 'Mínimo estatal heredado (Ley 16/1997). Sin verificar contra la norma autonómica.'),
  ('asturias',        NULL, 250, NULL, FALSE, 'https://www.boe.es/buscar/act.php?id=BOE-A-1997-9022', 'Mínimo estatal heredado (Ley 16/1997). Sin verificar contra la norma autonómica.'),
  ('cantabria',       NULL, 250, NULL, FALSE, 'https://www.boe.es/buscar/act.php?id=BOE-A-1997-9022', 'Mínimo estatal heredado (Ley 16/1997). Sin verificar contra la norma autonómica.'),
  ('castilla-leon',   NULL, 250, NULL, FALSE, 'https://www.boe.es/buscar/act.php?id=BOE-A-1997-9022', 'Mínimo estatal heredado. Ojo: Castilla y León distingue zonas urbanas/semiurbanas de las rurales; confirmar antes de usar.'),
  ('castilla-mancha', NULL, 250, NULL, FALSE, 'https://www.boe.es/buscar/act.php?id=BOE-A-1997-9022', 'Mínimo estatal heredado (Ley 16/1997). Sin verificar contra la norma autonómica.'),
  ('cataluna',        NULL, 250, NULL, FALSE, 'https://www.boe.es/buscar/act.php?id=BOE-A-1997-9022', 'Mínimo estatal heredado (Ley 16/1997). Sin verificar contra la norma autonómica.'),
  ('extremadura',     NULL, 250, NULL, FALSE, 'https://www.boe.es/buscar/act.php?id=BOE-A-1997-9022', 'Mínimo estatal heredado (Ley 16/1997). Sin verificar contra la norma autonómica.'),
  ('galicia',         NULL, 250, NULL, FALSE, 'https://www.boe.es/buscar/act.php?id=BOE-A-1997-9022', 'Mínimo estatal heredado (Ley 16/1997). Sin verificar contra la norma autonómica.'),
  ('murcia',          NULL, 250, NULL, FALSE, 'https://www.boe.es/buscar/act.php?id=BOE-A-1997-9022', 'Mínimo estatal heredado (Ley 16/1997). Sin verificar contra la norma autonómica.'),
  ('navarra',         NULL, 250, NULL, FALSE, 'https://www.boe.es/buscar/act.php?id=BOE-A-1997-9022', 'Mínimo estatal heredado (Ley 16/1997). Sin verificar contra la norma autonómica.'),
  ('pais-vasco',      NULL, 250, NULL, FALSE, 'https://www.boe.es/buscar/act.php?id=BOE-A-1997-9022', 'Mínimo estatal heredado (Ley 16/1997). Sin verificar contra la norma autonómica.'),
  ('rioja',           NULL, 250, NULL, FALSE, 'https://www.boe.es/buscar/act.php?id=BOE-A-1997-9022', 'Mínimo estatal heredado (Ley 16/1997). Sin verificar contra la norma autonómica.'),
  ('ceuta',           NULL, 250, NULL, FALSE, 'https://www.boe.es/buscar/act.php?id=BOE-A-1997-9022', 'Mínimo estatal heredado (Ley 16/1997). Sin verificar.'),
  ('melilla',         NULL, 250, NULL, FALSE, 'https://www.boe.es/buscar/act.php?id=BOE-A-1997-9022', 'Mínimo estatal heredado (Ley 16/1997). Sin verificar.')
ON CONFLICT DO NOTHING;
