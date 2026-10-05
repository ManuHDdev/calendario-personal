import { pool } from './pool';

// Migración idempotente de arranque, mismo patrón que finanzas
// (`ensureSchemaCapitales.ts`): `infra/init.sql` SOLO se ejecuta al crear el
// volumen de Postgres desde cero, así que una base de datos ya existente (la de
// producción, o cualquier entorno de desarrollo anterior) NO recibe las
// columnas/constraints añadidas después. La feature "sin restricciones por día"
// (commits 65088f2 / 1afca78) añadió `horario_zona.sin_restriccion`, hizo
// `hora_inicio`/`hora_fin` anulables y cambió el CHECK a `horario_valido` en
// `init.sql` y en el código (`GET /zonas` selecciona `h.sin_restriccion`), pero
// sin migrar las bases ya creadas: sobre una base antigua, `GET /zonas` falla con
// `column h.sin_restriccion does not exist` (500) y el mapa no carga.
//
// Esta función reconcilia una base existente con el estado de `init.sql`. Es
// segura sobre una base ya actualizada (todo es `IF (NOT) EXISTS` o
// `DROP ... IF EXISTS` + `ADD`) y sobre una recién creada por `init.sql`.
// Si se toca el esquema de `horario_zona`, actualizar los dos sitios.
export async function ensureSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE horario_zona
      ADD COLUMN IF NOT EXISTS sin_restriccion BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE horario_zona ALTER COLUMN hora_inicio DROP NOT NULL;
    ALTER TABLE horario_zona ALTER COLUMN hora_fin    DROP NOT NULL;

    -- El CHECK antiguo (solo exigía hora_fin > hora_inicio) es incompatible con
    -- las filas "sin restricción" (horas NULL). Se sustituye por el de init.sql.
    ALTER TABLE horario_zona DROP CONSTRAINT IF EXISTS hora_fin_mayor_que_inicio;
    ALTER TABLE horario_zona DROP CONSTRAINT IF EXISTS horario_valido;
    ALTER TABLE horario_zona ADD CONSTRAINT horario_valido CHECK (
      (sin_restriccion = TRUE  AND hora_inicio IS NULL AND hora_fin IS NULL) OR
      (sin_restriccion = FALSE AND hora_inicio IS NOT NULL AND hora_fin IS NOT NULL AND hora_fin > hora_inicio)
    );
  `);
}
