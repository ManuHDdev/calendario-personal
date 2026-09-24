/**
 * Importador de alquiler turístico (Inside Airbnb), patrón calcado de
 * `importador.ts`/`capitalScraper.ts`: `setTimeout` encadenado (nunca
 * `setInterval`), reutilizando `calcularProximaAccion()` de `importador.ts`
 * desde el primer día — ese helper existe precisamente porque los dos
 * importadores anteriores tenían el mismo bug real (reprogramar un
 * intervalo completo desde que arranca el proceso, no desde el último
 * intento real, dejando la importación congelada si los redespliegues son
 * más frecuentes que el intervalo).
 *
 * DE DÓNDE SALE LA LISTA DE DESCARGAS — verificado en vivo el 2026-09-24
 * (ver design.md del change `add-finanzas-airbnb-tracker`):
 * `https://insideairbnb.com/get-the-data/` es una página Gatsby, pero el
 * HTML servido por el servidor YA trae los enlaces reales de descarga sin
 * necesitar ejecutar JS — `curl` normal es suficiente, igual que ya hace
 * `importador.ts` con el XLS del Ministerio (mismo motivo para el
 * User-Agent de navegador: sin él, algunos orígenes devuelven 403/HTML
 * distinto). Se descartó depender del JSON interno de Gatsby
 * (`/page-data/sq/d/<hash>.json`): ese hash no es una API documentada y
 * puede cambiar en cualquier rebuild del sitio sin aviso; el HTML público
 * de "Get the Data" SÍ es la superficie estable (es la propia página que
 * Inside Airbnb dice usar para descargar).
 *
 * QUÉ SE DESCARGA — solo `visualisations/listings.csv` por ciudad (unos
 * pocos MB), nunca `data/listings.csv.gz` (más columnas, comprimido) ni
 * `calendar.csv.gz`/`reviews.csv.gz` (cientos de MB, uno o dos órdenes de
 * magnitud más pesados) — ver `airbnbCsvParser.ts` y design.md para el
 * porqué: el resumen ya trae precio, tipo de alojamiento, barrio, reseñas y
 * `availability_365` (usado como estimación de ocupación), suficiente para
 * lo que pide esta funcionalidad.
 */

import { pool } from '../db/pool';
import { CIUDADES_AIRBNB } from './airbnbCiudades';
import { parseListingsCsv, type FilaListingAirbnb } from './airbnbCsvParser';
import { calcularProximaAccion } from './importador';

const URL_GET_THE_DATA = 'https://insideairbnb.com/get-the-data/';

const INTERVALO_HORAS = Number(process.env.FINANZAS_INTERVALO_IMPORTACION_AIRBNB_HORAS) || 168;

export interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function proximaEsperaMs(): number {
  const base = INTERVALO_HORAS * 60 * 60_000;
  const jitter = base * 0.1;
  return Math.round(base - jitter + Math.random() * jitter * 2);
}

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface EnlaceCiudad {
  slug: string;
  snapshotDate: string; // 'YYYY-MM-DD'
  url: string;
}

/**
 * Extrae, para cada ciudad soportada, la URL de su `visualisations/
 * listings.csv` más reciente y la fecha de snapshot incluida en la propia
 * ruta. Regex deliberadamente estrecha (solo el dominio+patrón de ruta de
 * Inside Airbnb) en vez de un parser HTML completo: resiste cambios de
 * maquetación/CSS alrededor del enlace, solo se rompe si cambian el propio
 * dominio o la convención de ruta — que rompería también cualquier otra
 * herramienta que ya dependa de ella, incluida la suya propia.
 */
export function extraerEnlacesPorCiudad(html: string): EnlaceCiudad[] {
  const regex =
    /https:\/\/data\.insideairbnb\.com\/spain\/[^/"]+\/([a-z-]+)\/(\d{4}-\d{2}-\d{2})\/visualisations\/listings\.csv/g;
  const slugsSoportados = new Set(CIUDADES_AIRBNB.map((c) => c.slug));
  const porSlug = new Map<string, EnlaceCiudad>();

  let m: RegExpExecArray | null;
  while ((m = regex.exec(html))) {
    const [url, slug, snapshotDate] = m;
    if (!slugsSoportados.has(slug)) continue;
    // Nos quedamos con la primera aparición (la página solo lista el
    // snapshot vigente por ciudad, así que no debería haber más de una,
    // pero por si acaso no sobrescribimos con una posible segunda mención).
    if (!porSlug.has(slug)) {
      porSlug.set(slug, { slug, snapshotDate, url });
    }
  }

  return [...porSlug.values()];
}

async function descargarPaginaDatos(): Promise<string> {
  const respuesta = await fetch(URL_GET_THE_DATA, { headers: { 'User-Agent': USER_AGENT } });
  if (!respuesta.ok) {
    throw new Error(`Descarga de la página de datos fallida: HTTP ${respuesta.status}`);
  }
  return respuesta.text();
}

async function descargarCsv(url: string): Promise<string> {
  const respuesta = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!respuesta.ok) {
    throw new Error(`Descarga fallida: HTTP ${respuesta.status}`);
  }
  return respuesta.text();
}

async function existeSnapshot(ciudad: string, snapshotDate: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM alquiler_turistico_listing WHERE ciudad = $1 AND snapshot_date = $2 LIMIT 1`,
    [ciudad, snapshotDate],
  );
  return rows.length > 0;
}

/**
 * Query de upsert para una fila. Extraída como función pura (mismo patrón
 * que `construirUpsertFilaQuery` de `importador.ts`) para poder testear la
 * idempotencia sin base de datos real.
 */
export function construirUpsertFilaListingQuery(fila: FilaListingAirbnb): { text: string; values: unknown[] } {
  return {
    text: `INSERT INTO alquiler_turistico_listing (
        listing_id, ciudad, snapshot_date, nombre, barrio_grupo, barrio,
        latitud, longitud, tipo_habitacion, precio_noche,
        estancia_minima_noches, num_resenas, resenas_ultimos_12_meses,
        resenas_por_mes, ultima_resena, anuncios_del_anfitrion,
        disponibilidad_365, actualizado_en
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
      ON CONFLICT (listing_id, snapshot_date) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        barrio_grupo = EXCLUDED.barrio_grupo,
        barrio = EXCLUDED.barrio,
        latitud = EXCLUDED.latitud,
        longitud = EXCLUDED.longitud,
        tipo_habitacion = EXCLUDED.tipo_habitacion,
        precio_noche = EXCLUDED.precio_noche,
        estancia_minima_noches = EXCLUDED.estancia_minima_noches,
        num_resenas = EXCLUDED.num_resenas,
        resenas_ultimos_12_meses = EXCLUDED.resenas_ultimos_12_meses,
        resenas_por_mes = EXCLUDED.resenas_por_mes,
        ultima_resena = EXCLUDED.ultima_resena,
        anuncios_del_anfitrion = EXCLUDED.anuncios_del_anfitrion,
        disponibilidad_365 = EXCLUDED.disponibilidad_365,
        actualizado_en = NOW()`,
    values: [
      fila.listing_id,
      fila.ciudad,
      fila.snapshot_date,
      fila.nombre,
      fila.barrio_grupo,
      fila.barrio,
      fila.latitud,
      fila.longitud,
      fila.tipo_habitacion,
      fila.precio_noche,
      fila.estancia_minima_noches,
      fila.num_resenas,
      fila.resenas_ultimos_12_meses,
      fila.resenas_por_mes,
      fila.ultima_resena,
      fila.anuncios_del_anfitrion,
      fila.disponibilidad_365,
    ],
  };
}

async function upsertFilas(filas: FilaListingAirbnb[]): Promise<number> {
  let importadas = 0;
  for (const fila of filas) {
    const { text, values } = construirUpsertFilaListingQuery(fila);
    await pool.query(text, values);
    importadas++;
  }
  return importadas;
}

async function marcarEstado(ok: boolean, filasImportadas: number, error: string | null): Promise<void> {
  await pool.query(
    `UPDATE alquiler_turistico_estado
     SET ultima_ejecucion = NOW(), ultima_ejecucion_ok = $1, filas_importadas = $2, error = $3
     WHERE id = 1`,
    [ok, filasImportadas, error],
  );
}

/**
 * Una importación completa: descarga la página de enlaces, y para cada
 * ciudad soportada cuyo snapshot vigente no esté ya almacenado, descarga y
 * upsertea su CSV. Una ciudad que falla (descarga o parseo) se salta y se
 * loguea — nunca aborta la vuelta entera, mismo principio que
 * `capitalScraper.ts` ("un capital que falla no aborta la vuelta"). El run
 * se marca correcto en conjunto si al menos una ciudad se importó (o si no
 * había ninguna novedad que importar).
 */
export async function ejecutarImportacion(log: Logger): Promise<void> {
  let html: string;
  try {
    html = await descargarPaginaDatos();
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    log.error(`[airbnbImportador] Fallo descargando la página de datos: ${mensaje}`);
    try {
      await marcarEstado(false, 0, mensaje);
    } catch (dbErr) {
      log.error(
        `[airbnbImportador] Además falló al registrar el estado: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
      );
    }
    return;
  }

  const enlaces = extraerEnlacesPorCiudad(html);
  if (enlaces.length === 0) {
    const mensaje = 'No se encontró ningún enlace de descarga reconocible en la página de datos';
    log.error(`[airbnbImportador] ${mensaje}`);
    await marcarEstado(false, 0, mensaje).catch(() => undefined);
    return;
  }

  let totalImportadas = 0;
  let ciudadesOk = 0;
  const fallos: string[] = [];

  for (const enlace of enlaces) {
    try {
      const yaImportado = await existeSnapshot(enlace.slug, enlace.snapshotDate);
      if (yaImportado) {
        log.info(`[airbnbImportador] ${enlace.slug}: snapshot ${enlace.snapshotDate} ya importado, se salta`);
        ciudadesOk++;
        continue;
      }

      const csv = await descargarCsv(enlace.url);
      const warnings: string[] = [];
      const filas = parseListingsCsv(csv, enlace.slug, enlace.snapshotDate, warnings);
      for (const w of warnings) log.warn(`[airbnbImportador] ${w}`);

      const importadas = await upsertFilas(filas);
      totalImportadas += importadas;
      ciudadesOk++;
      log.info(`[airbnbImportador] ${enlace.slug}: ${importadas} anuncios importados (snapshot ${enlace.snapshotDate})`);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      log.warn(`[airbnbImportador] ${enlace.slug}: fallo (${mensaje})`);
      fallos.push(`${enlace.slug}: ${mensaje}`);
    }
  }

  const ok = ciudadesOk > 0;
  await marcarEstado(ok, totalImportadas, fallos.length > 0 ? fallos.join('; ') : null);
  log.info(
    `[airbnbImportador] Importación ${ok ? 'OK' : 'FALLIDA'}: ${totalImportadas} anuncios en total, ${ciudadesOk}/${enlaces.length} ciudades procesadas`,
  );
}

let temporizador: NodeJS.Timeout | null = null;
let parado = false;

async function tablaVacia(): Promise<boolean> {
  const { rows } = await pool.query<{ count: string }>('SELECT COUNT(*) FROM alquiler_turistico_listing');
  return Number(rows[0]?.count ?? '0') === 0;
}

async function ultimaEjecucion(): Promise<Date | null> {
  const { rows } = await pool.query<{ ultima_ejecucion: Date | null }>(
    'SELECT ultima_ejecucion FROM alquiler_turistico_estado WHERE id = 1',
  );
  return rows[0]?.ultima_ejecucion ?? null;
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
 * Arranca el importador de alquiler turístico. Mismo arreglo de reanudación
 * tras redespliegue que `importador.ts`/`capitalScraper.ts`: el próximo
 * intento se calcula desde `ultima_ejecucion` en `alquiler_turistico_estado`
 * (éxito o fallo, da igual), nunca desde que arrancó este proceso.
 */
export async function arrancarAirbnbImportador(log: Logger): Promise<void> {
  parado = false;
  log.info(
    `Importador de alquiler turístico (Inside Airbnb) programado cada ~${INTERVALO_HORAS}h. ` +
      'El origen se actualiza aproximadamente cada trimestre.',
  );

  const vacia = await tablaVacia();
  if (vacia) {
    log.info('Tabla alquiler_turistico_listing vacía: lanzando importación inicial.');
    await ejecutarImportacion(log);
    if (!parado) temporizador = setTimeout(() => void ciclo(log), proximaEsperaMs());
    return;
  }

  const ultima = await ultimaEjecucion();
  const intervaloMs = INTERVALO_HORAS * 60 * 60_000;
  const { ejecutarAhora, esperaMs } = calcularProximaAccion(ultima, new Date(), intervaloMs);

  if (ejecutarAhora) {
    log.info(
      ultima
        ? `[airbnbImportador] Toca importar: la última ejecución fue hace ${((Date.now() - ultima.getTime()) / 3_600_000).toFixed(1)}h.`
        : '[airbnbImportador] Sin ejecución previa registrada: lanzando importación ahora.',
    );
    await ejecutarImportacion(log);
    if (!parado) temporizador = setTimeout(() => void ciclo(log), proximaEsperaMs());
  } else {
    log.info(`[airbnbImportador] Siguiente intento en ~${(esperaMs / 3_600_000).toFixed(1)}h.`);
    temporizador = setTimeout(() => void ciclo(log), esperaMs);
  }
}

export function pararAirbnbImportador(): void {
  parado = true;
  if (temporizador) {
    clearTimeout(temporizador);
    temporizador = null;
  }
}
