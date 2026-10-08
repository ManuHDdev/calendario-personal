import { pool } from './pool';

// Migración idempotente de arranque, mismo patrón que finanzas/mapacyd.
// `infra/init.sql` SOLO se ejecuta al crear el volumen de Postgres desde cero,
// así que una base de datos ya existente conserva el esquema antiguo. El CHECK
// de `gasto.estado` se amplió a `'previsto'` después de la creación inicial
// (feature de gastos previstos); sobre una base antigua, el CHECK sigue sin
// `'previsto'` y cualquier INSERT/UPDATE con ese estado falla. Reconciliar.
//
// Seguro sobre una base ya correcta (DROP ... IF EXISTS + ADD con el mismo
// nombre autogenerado) y sobre una recién creada por init.sql. El nuevo CHECK
// es un superconjunto del anterior, así que ninguna fila existente lo viola.
export async function ensureSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE gasto DROP CONSTRAINT IF EXISTS gasto_estado_check;
    ALTER TABLE gasto ADD CONSTRAINT gasto_estado_check
      CHECK (estado IN ('pendiente_revision', 'confirmado', 'previsto'));
  `);
}
