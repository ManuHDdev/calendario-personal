-- Esquema de reparto (Tricount-style, ver openspec/changes/2026-08-11-add-reparto-app/design.md)
-- "group" es palabra reservada en SQL: se cita entre comillas dobles en toda la app
-- (backend y este fichero) en vez de renombrar la tabla, para no divergir del nombre
-- usado en design.md.

CREATE TABLE IF NOT EXISTS "group" (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                        TEXT           NOT NULL,
    access_token                TEXT           NOT NULL,
    manager_keycloak_user_id    TEXT           NOT NULL,
    activo                      BOOLEAN        NOT NULL DEFAULT TRUE,
    deleted_at                  TIMESTAMP,
    created_at                  TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMP      NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_group_access_token UNIQUE (access_token)
);

CREATE TABLE IF NOT EXISTS group_member (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id          UUID           NOT NULL REFERENCES "group"(id),
    name              TEXT           NOT NULL,
    keycloak_user_id  TEXT,
    activo            BOOLEAN        NOT NULL DEFAULT TRUE,
    deleted_at        TIMESTAMP,
    created_at        TIMESTAMP      NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expense (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id          UUID           NOT NULL REFERENCES "group"(id),
    payer_member_id   UUID           NOT NULL REFERENCES group_member(id),
    amount            NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    description       TEXT           NOT NULL,
    date              DATE           NOT NULL,
    category          TEXT,
    split_type        VARCHAR(10)    NOT NULL
                                      CHECK (split_type IN ('equal', 'exact', 'percentage')),
    activo            BOOLEAN        NOT NULL DEFAULT TRUE,
    deleted_at        TIMESTAMP,
    created_at        TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP      NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expense_split (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id        UUID           NOT NULL REFERENCES expense(id),
    member_id         UUID           NOT NULL REFERENCES group_member(id),
    share_amount      NUMERIC(10, 2) NOT NULL,
    share_percentage  NUMERIC(5, 2)
);

-- Trigger para updated_at automático (mismo patrón que gastos/infra/init.sql)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_group_updated_at ON "group";
CREATE TRIGGER update_group_updated_at
    BEFORE UPDATE ON "group"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_expense_updated_at ON expense;
CREATE TRIGGER update_expense_updated_at
    BEFORE UPDATE ON expense
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Índices: resolución del enlace de acceso (unicidad ya crea índice implícito
-- vía uq_group_access_token, se documenta explícitamente igualmente), y listados
-- por grupo/gasto.
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_access_token ON "group"(access_token);
CREATE INDEX IF NOT EXISTS idx_group_member_group_id ON group_member(group_id);
CREATE INDEX IF NOT EXISTS idx_expense_group_id ON expense(group_id);
CREATE INDEX IF NOT EXISTS idx_expense_split_expense_id ON expense_split(expense_id);
