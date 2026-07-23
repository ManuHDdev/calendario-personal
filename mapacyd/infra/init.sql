-- Tabla de zonas de carga y descarga (y, desde el campo tipo, spots de aparcamiento)
CREATE TABLE IF NOT EXISTS zona_cyd (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre      VARCHAR(100)    NOT NULL,
    descripcion VARCHAR(255),
    latitud     DECIMAL(10, 7)  NOT NULL,
    longitud    DECIMAL(10, 7)  NOT NULL,
    ciudad      VARCHAR(100)    NOT NULL DEFAULT 'Cáceres',
    tipo        VARCHAR(20)     NOT NULL DEFAULT 'carga_descarga'
                                CHECK (tipo IN ('carga_descarga', 'aparcamiento')),
    activo      BOOLEAN         NOT NULL DEFAULT TRUE,
    deleted_at  TIMESTAMP,
    created_at  TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP       NOT NULL DEFAULT NOW()
);

-- Ciudad preferida por usuario (id de Keycloak), con coordenadas ya
-- geocodificadas para centrar el mapa sin depender de zonas existentes
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id          TEXT           PRIMARY KEY,
    ciudad_preferida VARCHAR(100)   NOT NULL,
    latitud          DECIMAL(10, 7) NOT NULL,
    longitud         DECIMAL(10, 7) NOT NULL,
    updated_at       TIMESTAMP      NOT NULL DEFAULT NOW()
);

-- Tabla de franjas horarias por zona
CREATE TABLE IF NOT EXISTS horario_zona (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zona_id     UUID            NOT NULL REFERENCES zona_cyd(id) ON DELETE CASCADE,
    tipo_dia    VARCHAR(10)     NOT NULL CHECK (tipo_dia IN ('LMXJV', 'SABADO', 'DOMINGO')),
    hora_inicio TIME            NOT NULL,
    hora_fin    TIME            NOT NULL,
    activo      BOOLEAN         NOT NULL DEFAULT TRUE,
    deleted_at  TIMESTAMP,
    CONSTRAINT hora_fin_mayor_que_inicio CHECK (hora_fin > hora_inicio)
);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_zona_cyd_updated_at
    BEFORE UPDATE ON zona_cyd
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Índices
CREATE INDEX IF NOT EXISTS idx_zona_cyd_activo   ON zona_cyd(activo);
CREATE INDEX IF NOT EXISTS idx_zona_cyd_ciudad   ON zona_cyd(ciudad);
CREATE INDEX IF NOT EXISTS idx_horario_zona_zona ON horario_zona(zona_id);
