/**
 * Importador del XLS del Ministerio de Transportes, patrón calcado del
 * planificador de `pisos` (`services/planificador.ts`): `setTimeout`
 * encadenado, nunca `setInterval`, para que una importación lenta no se
 * solape consigo misma.
 *
 * El origen se actualiza como mucho una vez por trimestre, así que aquí no
 * hace falta jitter agresivo — uno pequeño (±10%) basta para no ser un
 * patrón perfectamente predecible.
 *
 * Una importación fallida (red caída, fichero cambiado de formato) NO debe
 * tumbar el backend ni vaciar la tabla: se loguea el error, se deja
 * constancia en `importacion_estado` y se reintenta en el siguiente ciclo —
 * mismo criterio que pisos/locales ("una importación fallida no vacía
 * nada").
 */

import { pool } from '../db/pool';
import { parseWorkbook, type FilaPrecio } from './xlsParser';

const URL_ORIGEN = 'https://apps.fomento.gob.es/BoletinOnline2/sedal/35101000.XLS';

const INTERVALO_HORAS = Number(process.env.FINANZAS_INTERVALO_IMPORTACION_HORAS) || 24;

export interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

function proximaEsperaMs(): number {
  const base = INTERVALO_HORAS * 60 * 60_000;
  const jitter = base * 0.1;
  return Math.round(base - jitter + Math.random() * jitter * 2);
}

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function descargarXls(): Promise<Buffer> {
  // El Ministerio devuelve 403 sin un User-Agent de navegador.
  const respuesta = await fetch(URL_ORIGEN, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  });
  if (!respuesta.ok) {
    throw new Error(`Descarga fallida: HTTP ${respuesta.status}`);
  }
  const arrayBuffer = await respuesta.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Construye la query de upsert para una fila. Extraído como función pura
 * (mismo patrón que `db/queries.ts` en pisos/locales) para poder testear la
 * idempotencia del UPSERT sin necesitar una base de datos real: dos llamadas
 * con la misma fila deben producir exactamente la misma query parametrizada,
 * y es el `ON CONFLICT ... DO UPDATE` sobre la unique (ambito, nombre, anio,
 * trimestre) el que garantiza en Postgres que reimportar no duplica.
 */
export function construirUpsertFilaQuery(fila: FilaPrecio): { text: string; values: unknown[] } {
  return {
    text: `INSERT INTO precio_vivienda (ambito, nombre, comunidad_autonoma, anio, trimestre, precio_m2, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (ambito, nombre, anio, trimestre)
       DO UPDATE SET precio_m2 = EXCLUDED.precio_m2, actualizado_en = NOW()`,
    values: [fila.ambito, fila.nombre, fila.comunidad_autonoma, fila.anio, fila.trimestre, fila.precio_m2],
  };
}

/** Upsert idempotente: reimportar el fichero entero nunca duplica filas. */
async function upsertFilas(filas: FilaPrecio[]): Promise<number> {
  let importadas = 0;
  for (const fila of filas) {
    const { text, values } = construirUpsertFilaQuery(fila);
    await pool.query(text, values);
    importadas++;
  }
  return importadas;
}

async function marcarEstado(ok: boolean, filasImportadas: number, error: string | null): Promise<void> {
  await pool.query(
    `UPDATE importacion_estado
     SET ultima_ejecucion = NOW(), ultima_ejecucion_ok = $1, filas_importadas = $2, error = $3
     WHERE id = 1`,
    [ok, filasImportadas, error],
  );
}

/** Una importación completa: descarga + parseo + upsert. */
export async function ejecutarImportacion(log: Logger): Promise<void> {
  try {
    const buffer = await descargarXls();
    const warnings: string[] = [];
    const filas = parseWorkbook(buffer, warnings);

    if (filas.length === 0) {
      throw new Error('El XLS se descargó pero no se reconoció ninguna fila de datos');
    }

    for (const w of warnings) log.warn(`[importador] ${w}`);

    const importadas = await upsertFilas(filas);
    await marcarEstado(true, importadas, null);
    log.info(`[importador] Importación OK: ${importadas} filas (${warnings.length} avisos)`);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    log.error(`[importador] Fallo en la importación: ${mensaje}`);
    try {
      await marcarEstado(false, 0, mensaje);
    } catch (dbErr) {
      log.error(
        `[importador] Además falló al registrar el estado: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
      );
    }
  }
}

let temporizador: NodeJS.Timeout | null = null;
let parado = false;

async function tablaVacia(): Promise<boolean> {
  const { rows } = await pool.query<{ count: string }>('SELECT COUNT(*) FROM precio_vivienda');
  return Number(rows[0]?.count ?? '0') === 0;
}

async function ciclo(log: Logger): Promise<void> {
  if (parado) return;
  try {
    await ejecutarImportacion(log);
  } finally {
    if (!parado) {
      temporizador = setTimeout(() => void ciclo(log), proximaEsperaMs());
    }
  }
}

/**
 * Arranca el importador programado. Si la tabla está vacía (primer
 * arranque), lanza una importación inicial inmediata; si ya hay datos,
 * espera al primer intervalo para no disparar una descarga en cada
 * redespliegue.
 */
export async function arrancarImportador(log: Logger): Promise<void> {
  parado = false;
  log.info(
    `Importador de precios de vivienda programado cada ~${INTERVALO_HORAS}h. ` +
      'El origen se actualiza como mucho cada trimestre.',
  );

  const vacia = await tablaVacia();
  if (vacia) {
    log.info('Tabla precio_vivienda vacía: lanzando importación inicial.');
    await ejecutarImportacion(log);
    if (!parado) temporizador = setTimeout(() => void ciclo(log), proximaEsperaMs());
  } else {
    temporizador = setTimeout(() => void ciclo(log), proximaEsperaMs());
  }
}

export function pararImportador(): void {
  parado = true;
  if (temporizador) {
    clearTimeout(temporizador);
    temporizador = null;
  }
}

// Exportado solo para tests.
export { dormir };
