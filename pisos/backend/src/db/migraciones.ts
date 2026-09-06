/**
 * Migraciones de esquema, aplicadas al arrancar.
 *
 * NO es una herramienta de migraciones: es una lista de sentencias DDL
 * idempotentes que se ejecutan en orden en cada arranque. `init.sql` sigue
 * siendo la fuente de verdad del esquema para una instalación nueva; esto
 * existe solo para que una base de datos YA DESPLEGADA se ponga al día sola.
 *
 * El motivo es de seguridad operativa: sin esto, desplegar una imagen que usa
 * una columna nueva contra la base antigua rompe cada rastreo hasta que
 * alguien recuerda entrar por SSH a ejecutar un ALTER. Ese "alguien recuerda"
 * es justo lo que no queremos que sostenga la producción.
 *
 * Reglas para añadir aquí una sentencia:
 *   · Idempotente (IF NOT EXISTS / IF EXISTS), porque corre en CADA arranque.
 *   · Nunca destructiva: sin DROP COLUMN ni DROP TABLE. Retirar una columna se
 *     hace a mano y con la base parada, no en un arranque desatendido.
 *   · Barata: se ejecuta antes de aceptar tráfico.
 */

import { pool } from './pool';

interface Migracion {
  nombre: string;
  sql: string;
}

const MIGRACIONES: Migracion[] = [
  {
    nombre: 'anuncio.precio_notificado',
    // Referencia de precio del último aviso entregado. Antes se comparaba
    // contra `precio_previo`, que es pegajoso, y una misma bajada se
    // reenviaba en cada vuelta del rastreador.
    sql: `ALTER TABLE anuncio ADD COLUMN IF NOT EXISTS precio_notificado NUMERIC(12, 2)`,
  },
  {
    nombre: 'anuncio.precio_notificado — referencia inicial',
    // Los anuncios que ya existían se toman por avisados a su precio actual:
    // así una bajada futura sí se detecta, y ninguno de ellos se reenvía por
    // el simple hecho de haber bajado en el pasado.
    sql: `UPDATE anuncio
             SET precio_notificado = precio
           WHERE precio_notificado IS NULL
             AND notificado_at IS NOT NULL`,
  },
];

export async function aplicarMigraciones(log: { info: (m: string) => void }): Promise<void> {
  for (const { nombre, sql } of MIGRACIONES) {
    const { rowCount } = await pool.query(sql);
    log.info(`Migración aplicada: ${nombre}${rowCount ? ` (${rowCount} fila(s))` : ''}`);
  }
}
