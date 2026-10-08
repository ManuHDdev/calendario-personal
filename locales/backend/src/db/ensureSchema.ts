import { pool } from './pool';

// Migración idempotente de arranque, mismo patrón que finanzas/mapacyd.
// `infra/init.sql` SOLO se ejecuta al crear el volumen de Postgres desde cero.
// init.sql incluye estos `ALTER ... IF (NOT) EXISTS` "por si la tabla ya
// existía", PERO al no re-ejecutarse sobre un volumen existente, nunca llegan a
// aplicarse en producción salvo recreación del volumen. Ejecutarlos en cada
// arranque los hace realmente efectivos (son idempotentes, inofensivos sobre
// una base ya correcta). Si se tocan aquí, actualizar también init.sql.
export async function ensureSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE busqueda ADD COLUMN IF NOT EXISTS habilitada BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE busqueda ADD COLUMN IF NOT EXISTS notificar  BOOLEAN NOT NULL DEFAULT TRUE;

    -- Migración idempotente desde la clave única global anterior, si existía.
    ALTER TABLE anuncio DROP CONSTRAINT IF EXISTS anuncio_portal_portal_id_key;
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'anuncio_busqueda_id_portal_portal_id_key'
      ) THEN
        ALTER TABLE anuncio
          ADD CONSTRAINT anuncio_busqueda_id_portal_portal_id_key
          UNIQUE (busqueda_id, portal, portal_id);
      END IF;
    END $$;
  `);
}
