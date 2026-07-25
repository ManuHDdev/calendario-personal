-- Tabla de gastos personales (ver openspec/changes/2026-07-25-add-gastos-app/design.md)
CREATE TABLE IF NOT EXISTS gasto (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    importe     NUMERIC(10, 2) NOT NULL,
    fecha       DATE           NOT NULL,
    comercio    TEXT           NOT NULL,
    concepto    TEXT,
    categoria   TEXT,
    origen      VARCHAR(10)    NOT NULL DEFAULT 'manual'
                                CHECK (origen IN ('manual', 'ticket', 'banco')),
    estado      VARCHAR(20)    NOT NULL DEFAULT 'confirmado'
                                CHECK (estado IN ('pendiente_revision', 'confirmado')),
    imagen_path TEXT,
    activo      BOOLEAN        NOT NULL DEFAULT TRUE,
    deleted_at  TIMESTAMP,
    created_at  TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP      NOT NULL DEFAULT NOW()
);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_gasto_updated_at
    BEFORE UPDATE ON gasto
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Índices: listados/filtros por fecha y por estado (pendientes vs confirmados),
-- y activo para excluir borrados lógicos de listados y totales.
CREATE INDEX IF NOT EXISTS idx_gasto_fecha  ON gasto(fecha);
CREATE INDEX IF NOT EXISTS idx_gasto_estado ON gasto(estado);
CREATE INDEX IF NOT EXISTS idx_gasto_activo ON gasto(activo);
