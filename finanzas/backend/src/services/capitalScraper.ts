/**
 * Scraper del precio medio de vivienda por m² en las 52 capitales de
 * provincia, a partir de anuncios reales de Fotocasa y pisos.com.
 *
 * Mismo patrón que `importador.ts` (`setTimeout` encadenado, nunca
 * `setInterval`, para que una vuelta larga no se solape consigo misma; una
 * ejecución fallida nunca vacía la tabla, solo se loguea y queda constancia
 * en `capital_scraper_estado`) pero con un origen distinto y bastante más
 * volumen: 52 capitales × 2 portales = 104 peticiones por vuelta completa
 * (frente a 1 descarga de XLS). Por eso aquí SÍ hace falta jitter entre
 * capital y capital — no por ser predecible, sino para no generar una ráfaga
 * de peticiones nueva contra portales que ya bloquean por exceso de
 * velocidad (ver `portales/http.ts`).
 *
 * Diferencias deliberadas frente al rastreo de `pisos`:
 *  - Una sola página por capital y portal (no dos): esto es una foto
 *    periódica del precio medio, no un feed de anuncios nuevos — una
 *    muestra de ~30 anuncios por portal ya da una media razonable, y pedir
 *    una página en vez de dos reduce el volumen de peticiones a la mitad.
 *  - Recorrido SECUENCIAL (capital a capital, portal a portal), con una
 *    pausa entre capitales: este tráfico es nuevo para ambos portales
 *    (`pisos` busca por búsquedas guardadas del usuario, no las 52
 *    capitales de España una detrás de otra), así que se es más
 *    conservador de lo habitual mientras no se compruebe que aguantan el
 *    ritmo.
 *  - Un capital o portal que falla (0 anuncios, error de red, bloqueo) NO
 *    aborta la vuelta: se loguea, no se inserta fila para ese capital+portal
 *    (no una fila con precio 0) y se sigue con el siguiente. Mismo criterio
 *    transversal de la app: "un dato parcial no debe parecerse a uno
 *    completo", aquí aplicado como "un fallo puntual no tira el resto".
 */

import { pool } from '../db/pool';
import { CAPITALES, provinciaDeCapital } from './capitales';
import { fotocasaProvider } from '../portales/fotocasa';
import { pisosComProvider } from '../portales/pisoscom';
import { mediana } from './mediana';
import type { AnuncioCrudo, CriteriosPortal, PortalProvider } from '../portales/types';

const INTERVALO_HORAS = Number(process.env.FINANZAS_INTERVALO_SCRAPER_CAPITAL_HORAS) || 24;

// Pausa entre capitales: conservadora a propósito (ver cabecera del fichero).
const PAUSA_ENTRE_CAPITALES_MS_BASE = 3_000; // 2-4s con jitter
const PAUSA_ENTRE_CAPITALES_JITTER_MS = 1_000;

const PROVIDERS: PortalProvider[] = [fotocasaProvider, pisosComProvider];

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

function pausaEntreCapitalesMs(): number {
  return Math.round(
    PAUSA_ENTRE_CAPITALES_MS_BASE - PAUSA_ENTRE_CAPITALES_JITTER_MS / 2 + Math.random() * PAUSA_ENTRE_CAPITALES_JITTER_MS,
  );
}

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fecha de hoy en formato YYYY-MM-DD (columna `fecha_captura`, tipo DATE). */
function fechaHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface FilaCapital {
  capital: string;
  provincia: string;
  portal: string;
  fechaCaptura: string;
  precioM2Medio: number;
  numAnuncios: number;
}

/**
 * Calcula el precio medio por m² de una lista de anuncios crudos.
 *
 * Solo cuentan los anuncios con precio Y metros (ambos, no basta con uno):
 * sin superficie no se puede calcular precio/m², y sin precio tampoco. Un
 * anuncio al que le falte cualquiera de los dos simplemente no participa en
 * la media — no descarta ni penaliza al resto (mismo principio de
 * "desconocido no es excluyente" que usa `pisos` para ascensor/garaje).
 * Devuelve `null` si ningún anuncio califica: cero anuncios no es una media
 * de 0€/m², es "no hay dato".
 *
 * MEDIANA, no media aritmética: verificado en local contra datos reales de
 * Fotocasa — un solo anuncio mal etiquetado (un local/ático de lujo con
 * superficie mal indicada, p. ej.) puede disparar el precio/m² a un valor
 * disparatado (~15.800 €/m² visto en un anuncio de Jaén), y con solo ~30
 * anuncios por capital y portal, una media aritmética arrastra ese valor a
 * toda la capital (9.045 €/m² de media para Jaén, cuando el resto de
 * anuncios rondaba 1.800-2.000 €/m²). La mediana ignora ese tipo de atípico
 * sin necesitar detectarlo explícitamente. La función `mediana()` en sí vive
 * en `./mediana.ts`, compartida con `rentabilidadZona.ts` (mismo problema,
 * mismo remedio, sobre precio/m² de alquiler en vez de venta).
 */
export function calcularPrecioMedioM2(
  anuncios: AnuncioCrudo[],
): { precioM2Medio: number; numAnuncios: number } | null {
  const preciosPorM2 = anuncios
    .filter((a) => a.precio !== null && a.precio > 0 && a.metros !== null && a.metros > 0)
    .map((a) => (a.precio as number) / (a.metros as number));
  if (preciosPorM2.length === 0) return null;

  const medianaPrecio = mediana(preciosPorM2) as number;

  return { precioM2Medio: Math.round(medianaPrecio * 100) / 100, numAnuncios: preciosPorM2.length };
}

/**
 * Construye la query de upsert para una fila. Función pura (mismo patrón que
 * `construirUpsertFilaQuery` de `importador.ts`) para poder testear la
 * idempotencia sin base de datos real.
 */
export function construirUpsertFilaCapitalQuery(fila: FilaCapital): { text: string; values: unknown[] } {
  return {
    text: `INSERT INTO precio_vivienda_capital (capital, provincia, portal, fecha_captura, precio_m2_medio, num_anuncios, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (capital, portal, fecha_captura)
       DO UPDATE SET precio_m2_medio = EXCLUDED.precio_m2_medio, num_anuncios = EXCLUDED.num_anuncios, actualizado_en = NOW()`,
    values: [fila.capital, fila.provincia, fila.portal, fila.fechaCaptura, fila.precioM2Medio, fila.numAnuncios],
  };
}

async function upsertFila(fila: FilaCapital): Promise<void> {
  const { text, values } = construirUpsertFilaCapitalQuery(fila);
  await pool.query(text, values);
}

/**
 * Expuesto para los tests: el scraper de capitales solo rastrea VENTA — el
 * alquiler es cosa de `rentabilidadZona.ts`, que reutiliza el mismo módulo
 * de portales pero con `operacion: 'alquiler'` para su pata de comparables.
 */
export function criteriosParaCapital(capital: string): CriteriosPortal {
  return {
    tipo: 'vivienda',
    operacion: 'venta',
    ubicacion: capital,
    latitud: null,
    longitud: null,
    radioKm: null,
    precioMin: null,
    precioMax: null,
    metrosMin: null,
    metrosMax: null,
    habitacionesMin: null,
    banosMin: null,
  };
}

/**
 * Rastrea una capital contra un único portal, una sola página. Un fallo (red,
 * bloqueo, cero anuncios que cumplan) se traduce en `false` y se loguea; no
 * lanza, para que el bucle de capitales pueda seguir con la siguiente.
 */
async function rastrearCapitalPortal(
  capital: string,
  provincia: string,
  provider: PortalProvider,
  fecha: string,
  log: Logger,
): Promise<boolean> {
  const criterios = criteriosParaCapital(capital);
  const puede = provider.puedeBuscar(criterios);
  if (!puede.ok) {
    log.warn(`[capitalScraper] ${capital}/${provider.id}: omitido (${puede.motivo})`);
    return false;
  }

  try {
    const anuncios = await provider.buscar(criterios, { maxPaginas: 1 });
    const resultado = calcularPrecioMedioM2(anuncios);
    if (resultado === null) {
      log.warn(`[capitalScraper] ${capital}/${provider.id}: sin anuncios con precio+m² válidos, se omite`);
      return false;
    }

    await upsertFila({
      capital,
      provincia,
      portal: provider.id,
      fechaCaptura: fecha,
      precioM2Medio: resultado.precioM2Medio,
      numAnuncios: resultado.numAnuncios,
    });
    log.info(
      `[capitalScraper] ${capital}/${provider.id}: ${resultado.precioM2Medio} €/m² (${resultado.numAnuncios} anuncios)`,
    );
    return true;
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    log.warn(`[capitalScraper] ${capital}/${provider.id}: fallo (${mensaje})`);
    return false;
  }
}

async function marcarEstado(
  ok: boolean,
  capitalesOk: number,
  capitalesFallidas: number,
  error: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE capital_scraper_estado
     SET ultima_ejecucion = NOW(), ultima_ejecucion_ok = $1, capitales_ok = $2, capitales_fallidas = $3, error = $4
     WHERE id = 1`,
    [ok, capitalesOk, capitalesFallidas, error],
  );
}

/** Una vuelta completa: las 52 capitales, secuencial, con pausa entre cada una. */
export async function ejecutarScraperCapitales(log: Logger): Promise<void> {
  const fecha = fechaHoy();
  let capitalesOk = 0;
  let capitalesFallidas = 0;

  try {
    for (const capital of CAPITALES) {
      const provincia = provinciaDeCapital(capital);
      if (!provincia) {
        // No debería ocurrir (CAPITALES sale del mismo mapa), pero un capital
        // sin provincia asociada no puede insertarse (provincia NOT NULL).
        log.error(`[capitalScraper] ${capital}: sin provincia asociada en el mapa, se omite`);
        capitalesFallidas++;
        continue;
      }

      let algunPortalOk = false;
      for (const provider of PROVIDERS) {
        const ok = await rastrearCapitalPortal(capital, provincia, provider, fecha, log);
        if (ok) algunPortalOk = true;
      }
      if (algunPortalOk) capitalesOk++;
      else capitalesFallidas++;

      // Pausa entre capitales (no tras la última, para no alargar la vuelta sin motivo).
      if (capital !== CAPITALES[CAPITALES.length - 1]) {
        await dormir(pausaEntreCapitalesMs());
      }
    }

    await marcarEstado(true, capitalesOk, capitalesFallidas, null);
    log.info(`[capitalScraper] Vuelta completa: ${capitalesOk} capitales OK, ${capitalesFallidas} sin dato`);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    log.error(`[capitalScraper] Fallo inesperado en la vuelta: ${mensaje}`);
    try {
      await marcarEstado(false, capitalesOk, capitalesFallidas, mensaje);
    } catch (dbErr) {
      log.error(
        `[capitalScraper] Además falló al registrar el estado: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
      );
    }
  }
}

let temporizador: NodeJS.Timeout | null = null;
let parado = false;

async function tablaVacia(): Promise<boolean> {
  const { rows } = await pool.query<{ count: string }>('SELECT COUNT(*) FROM precio_vivienda_capital');
  return Number(rows[0]?.count ?? '0') === 0;
}

async function ciclo(log: Logger): Promise<void> {
  if (parado) return;
  try {
    await ejecutarScraperCapitales(log);
  } finally {
    if (!parado) {
      temporizador = setTimeout(() => void ciclo(log), proximaEsperaMs());
    }
  }
}

/**
 * Arranca el scraper programado de capitales. Si la tabla está vacía (primer
 * arranque), lanza una vuelta inicial inmediata; si ya hay datos, espera al
 * primer intervalo para no disparar 104 peticiones en cada redespliegue.
 */
export async function arrancarScraperCapitales(log: Logger): Promise<void> {
  parado = false;
  log.info(
    `Scraper de precios de vivienda por capital programado cada ~${INTERVALO_HORAS}h ` +
      '(52 capitales × Fotocasa/pisos.com, secuencial con pausa entre capitales).',
  );

  const vacia = await tablaVacia();
  if (vacia) {
    log.info('Tabla precio_vivienda_capital vacía: lanzando vuelta inicial.');
    await ejecutarScraperCapitales(log);
    if (!parado) temporizador = setTimeout(() => void ciclo(log), proximaEsperaMs());
  } else {
    temporizador = setTimeout(() => void ciclo(log), proximaEsperaMs());
  }
}

export function pararScraperCapitales(): void {
  parado = true;
  if (temporizador) {
    clearTimeout(temporizador);
    temporizador = null;
  }
}
