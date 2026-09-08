/**
 * Presupuesto diario de peticiones al motor de rutas.
 *
 * Mismo principio que `plan.fullCoverage` en `ruta`: quedarse sin cuota es una
 * limitación de infraestructura, y NUNCA debe convertirse en una decisión de
 * negocio silenciosa. Agotado el presupuesto, los anuncios se siguen guardando
 * con veredicto `sin_datos` y su motivo, y se recalculan en la vuelta
 * siguiente. Descartarlos por no haberlos podido medir sería exactamente el
 * fallo que esta app existe para evitar.
 *
 * El contador vive en Postgres y no en memoria porque un redespliegue no debe
 * regalar cuota que la API de terceros sí sigue contando.
 */

import { pool } from '../db/pool';
import type { NombreMotor } from '../types/locales';

/**
 * Tope por defecto para ORS.
 *
 * Deliberadamente por debajo de la cuota real del plan gratuito: el endpoint
 * de MATRIZ tiene un límite más bajo que el de direcciones que usan `paraisos`
 * y `ruta`, y preferimos fallar con un motivo claro a que la clave compartida
 * del monorepo acabe estrangulada para todas las subapps.
 */
const TOPE_POR_DEFECTO_ORS = 400;

/** Una instancia propia no tiene cuota: contar sus peticiones no aporta nada. */
function tieneCuota(motor: NombreMotor): boolean {
  return motor === 'ors';
}

/** `null` = este motor no tiene cuota (instancia propia). */
export function topeDiario(motor: NombreMotor): number | null {
  if (!tieneCuota(motor)) return null;
  const configurado = parseInt(process.env.LOCALES_PRESUPUESTO_RUTAS_DIARIO || '', 10);
  return Number.isFinite(configurado) && configurado > 0 ? configurado : TOPE_POR_DEFECTO_ORS;
}

export interface EstadoPresupuesto {
  motor: NombreMotor;
  usadas: number;
  /** `null` = sin cuota. No se usa Infinity: JSON lo serializa a `null` a
   *  traición, y entonces "sin límite" y "límite cero" se leerían igual. */
  tope: number | null;
  disponibles: number | null;
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function estadoPresupuesto(motor: NombreMotor): Promise<EstadoPresupuesto> {
  const tope = topeDiario(motor);
  const { rows } = await pool.query<{ peticiones: number }>(
    'SELECT peticiones FROM presupuesto_rutas WHERE dia = $1 AND motor = $2',
    [hoy(), motor],
  );
  const usadas = rows[0]?.peticiones ?? 0;
  return { motor, usadas, tope, disponibles: tope === null ? null : Math.max(0, tope - usadas) };
}

/**
 * Reserva `n` peticiones si caben, de forma atómica.
 *
 * Devuelve `true` si se reservaron y `false` si no había presupuesto. Se
 * reserva ANTES de llamar al motor, no después: contar solo los éxitos haría
 * que una racha de errores consumiera cuota real sin aparecer en el contador.
 */
export async function reservar(motor: NombreMotor, n: number): Promise<boolean> {
  if (n <= 0) return true;
  if (!tieneCuota(motor)) return true;

  const tope = topeDiario(motor);
  if (tope === null) return true;
  // El WHERE del DO UPDATE solo protege la actualización: en el primer INSERT
  // del día no se evalúa, así que una reserva mayor que el tope entero pasaría
  // sin este corte previo.
  if (n > tope) return false;

  const { rows } = await pool.query<{ peticiones: number }>(
    `INSERT INTO presupuesto_rutas (dia, motor, peticiones)
     VALUES ($1, $2, $3)
     ON CONFLICT (dia, motor) DO UPDATE
       SET peticiones = presupuesto_rutas.peticiones + EXCLUDED.peticiones
       WHERE presupuesto_rutas.peticiones + EXCLUDED.peticiones <= $4
     RETURNING peticiones`,
    [hoy(), motor, n, tope],
  );

  // Sin fila devuelta, el WHERE del DO UPDATE rechazó la reserva: no cabía.
  return rows.length > 0;
}
