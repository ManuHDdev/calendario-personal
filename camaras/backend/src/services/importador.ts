/**
 * Importador programado del feed de cámaras de la DGT, mismo patrón que
 * `finanzas/backend/src/services/importador.ts`: `setTimeout` encadenado (nunca
 * `setInterval`) y el siguiente intento se calcula desde el ÚLTIMO intento
 * guardado en `importacion_estado`, no desde que arrancó este proceso (si no,
 * redespliegues más frecuentes que el intervalo congelarían la importación).
 *
 * Una importación fallida no vacía nada: se loguea, se deja constancia en
 * `importacion_estado` (que la UI enseña) y se reintenta en el siguiente ciclo.
 * Tampoco se retira ninguna cámara si el feed no trajo al menos una cercana:
 * un feed roto no debe vaciar el mapa.
 */

import { pool } from '../db/pool';
import { construirUpsertCamaraDgtQuery } from '../db/queries';
import { parsearFeedDgt } from './dgtParser';
import { filtrarCercanas, contarPorCiudad } from './cobertura';

// DATEX II v3.6 (publicación de dispositivos). La DGT tiene también v3.7
// (`camaras_datex2_v37.xml`); se puede cambiar sin tocar código con la variable.
export const URL_FEED_POR_DEFECTO = 'https://nap.dgt.es/datex2/v3/dgt/DevicePublication/camaras_datex2_v36.xml';

const INTERVALO_HORAS = Number(process.env.CAMARAS_INTERVALO_IMPORTACION_HORAS) || 24;

export interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

export function urlFeed(): string {
  return process.env.CAMARAS_DGT_FEED_URL || URL_FEED_POR_DEFECTO;
}

export async function descargarFeed(url: string = urlFeed()): Promise<string> {
  const respuesta = await fetch(url, {
    headers: { 'User-Agent': 'calendario-camaras/1.0', Accept: 'application/xml,text/xml,*/*' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!respuesta.ok) throw new Error(`Descarga fallida: HTTP ${respuesta.status} (${url})`);
  return respuesta.text();
}

export interface ResultadoImportacion {
  totalFeed: number;
  totalCercanas: number;
  porCiudad: Record<string, number>;
}

async function marcarEstado(
  ok: boolean,
  resultado: ResultadoImportacion | null,
  error: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE importacion_estado
     SET ultima_ejecucion = NOW(), ultima_ok = $1, total_feed = $2, total_cercanas = $3, por_ciudad = $4, error = $5
     WHERE id = 1`,
    [ok, resultado?.totalFeed ?? null, resultado?.totalCercanas ?? null, resultado ? JSON.stringify(resultado.porCiudad) : null, error],
  );
}

/**
 * Una importación completa. Lanza si falla (la ruta manual quiere el error);
 * `ejecutarImportacionSegura` es la variante que no lanza, para el planificador.
 */
export async function ejecutarImportacion(log: Logger): Promise<ResultadoImportacion> {
  const inicio = new Date();
  const xml = await descargarFeed();
  const feed = parsearFeedDgt(xml);
  if (feed.length === 0) {
    throw new Error('El feed se descargó pero no se reconoció ninguna cámara (¿cambió el formato?)');
  }

  const cercanas = filtrarCercanas(feed);
  if (cercanas.length === 0) {
    throw new Error(`El feed trae ${feed.length} cámaras pero ninguna cae en las ciudades configuradas`);
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    for (const { camara, ciudad, distanciaKm } of cercanas) {
      const { text, values } = construirUpsertCamaraDgtQuery(camara, ciudad, distanciaKm);
      await cliente.query(text, values);
    }
    // Las de la DGT que ya no aparecen en el feed se ocultan (retirada), no se borran:
    // si vuelven, el upsert las reactiva.
    const retiradas = await cliente.query(
      `UPDATE camara SET retirada = true, updated_at = NOW()
       WHERE origen = 'dgt' AND retirada = false AND (visto_en IS NULL OR visto_en < $1)`,
      [inicio],
    );
    await cliente.query('COMMIT');
    if (retiradas.rowCount) log.info(`[importador] ${retiradas.rowCount} cámaras ya no están en el feed y se ocultan`);
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    cliente.release();
  }

  const resultado: ResultadoImportacion = {
    totalFeed: feed.length,
    totalCercanas: cercanas.length,
    porCiudad: contarPorCiudad(cercanas),
  };
  await marcarEstado(true, resultado, null);
  log.info(`[importador] OK: ${cercanas.length} cámaras cercanas de ${feed.length} en el feed ${JSON.stringify(resultado.porCiudad)}`);
  return resultado;
}

export async function ejecutarImportacionSegura(log: Logger): Promise<void> {
  try {
    await ejecutarImportacion(log);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    log.error(`[importador] Fallo en la importación: ${mensaje}`);
    try {
      // Conserva los últimos totales buenos: solo cambia ok/error/fecha.
      await pool.query(
        `UPDATE importacion_estado SET ultima_ejecucion = NOW(), ultima_ok = false, error = $1 WHERE id = 1`,
        [mensaje],
      );
    } catch (dbErr) {
      log.error(`[importador] Además falló al registrar el estado: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
    }
  }
}

let temporizador: NodeJS.Timeout | null = null;
let parado = false;

function proximaEsperaMs(): number {
  const base = INTERVALO_HORAS * 60 * 60_000;
  const jitter = base * 0.1;
  return Math.round(base - jitter + Math.random() * jitter * 2);
}

/**
 * Decide si toca importar YA o cuánto queda, a partir del último intento
 * (éxito o fallo). Función pura para poder testear la reanudación tras un
 * redespliegue sin base de datos.
 */
export function calcularProximaAccion(
  ultima: Date | null,
  ahora: Date,
  intervaloMs: number,
): { ejecutarAhora: boolean; esperaMs: number } {
  const transcurridoMs = ultima ? ahora.getTime() - ultima.getTime() : Infinity;
  if (transcurridoMs >= intervaloMs) return { ejecutarAhora: true, esperaMs: 0 };
  return { ejecutarAhora: false, esperaMs: intervaloMs - transcurridoMs };
}

async function ciclo(log: Logger): Promise<void> {
  if (parado) return;
  try {
    await ejecutarImportacionSegura(log);
  } finally {
    if (!parado) temporizador = setTimeout(() => void ciclo(log), proximaEsperaMs());
  }
}

export async function arrancarImportador(log: Logger): Promise<void> {
  parado = false;
  log.info(`Importador de cámaras DGT programado cada ~${INTERVALO_HORAS}h (${urlFeed()})`);

  const { rows } = await pool.query<{ ultima_ejecucion: Date | null }>(
    'SELECT ultima_ejecucion FROM importacion_estado WHERE id = 1',
  );
  const intervaloMs = INTERVALO_HORAS * 60 * 60_000;
  const { ejecutarAhora, esperaMs } = calcularProximaAccion(rows[0]?.ultima_ejecucion ?? null, new Date(), intervaloMs);

  if (ejecutarAhora) {
    await ciclo(log);
  } else {
    temporizador = setTimeout(() => void ciclo(log), esperaMs);
  }
}

export function detenerImportador(): void {
  parado = true;
  if (temporizador) clearTimeout(temporizador);
  temporizador = null;
}
