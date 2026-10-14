import { pool } from './pool';

// Migración idempotente de arranque, mismo patrón que finanzas/mapacyd.
// `infra/init.sql` SOLO se ejecuta al crear el volumen de Postgres desde cero,
// así que una base de datos ya existente conserva el esquema antiguo. Cada
// cambio posterior a la creación inicial se reconcilia aquí; las definiciones
// deben mantenerse idénticas a las de init.sql.
//
// 1) El CHECK de `gasto.estado` se amplió a `'previsto'` (feature de gastos
//    previstos); sobre una base antigua sigue sin `'previsto'` y cualquier
//    INSERT/UPDATE con ese estado falla. El nuevo CHECK es un superconjunto
//    del anterior, así que ninguna fila existente lo viola.
// 2) `gasto.tipo` ('gasto' | 'ganancia') es nuevo: el DEFAULT constante deja
//    todas las filas existentes (y todo lo que insertan el bot y el OCR sin
//    nombrar la columna) como 'gasto', sin backfill.
//
// Seguro sobre una base ya correcta (ADD COLUMN IF NOT EXISTS; DROP ... IF
// EXISTS + ADD con el mismo nombre) y sobre una recién creada por init.sql.
// Todo va en un único query, que Postgres ejecuta en una sola transacción.
export async function ensureSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE gasto DROP CONSTRAINT IF EXISTS gasto_estado_check;
    ALTER TABLE gasto ADD CONSTRAINT gasto_estado_check
      CHECK (estado IN ('pendiente_revision', 'confirmado', 'previsto'));

    ALTER TABLE gasto ADD COLUMN IF NOT EXISTS tipo VARCHAR(10) NOT NULL DEFAULT 'gasto';
    ALTER TABLE gasto DROP CONSTRAINT IF EXISTS gasto_tipo_check;
    ALTER TABLE gasto ADD CONSTRAINT gasto_tipo_check
      CHECK (tipo IN ('gasto', 'ganancia'));
  `);
}
