/**
 * El planificador: el bucle que hace que la app sirva de algo sin que haya que
 * pedírselo. Vive dentro del propio proceso del backend (`setTimeout`
 * encadenado, nunca `setInterval`, para que una vuelta larga no se solape
 * consigo misma).
 *
 * Además del rastreo, se ocupa de dos tareas de fondo, ambas defensivas (un
 * fallo aquí NUNCA puede matar el bucle):
 *  - refresco semanal del padrón (y arranque en frío si está vacío);
 *  - recálculo de viabilidad de un lote acotado de anuncios por vuelta.
 */

import {
  anunciosParaRecalcular,
  actualizarViabilidad,
  comunidadesEnPadron,
  getScraperState,
  listBusquedasRastreables,
  marcarNotificado,
} from '../db/queries';
import { importarComunidad, padronVacio } from '../padron/importar';
import { getMotor } from '../viabilidad/motor';
import { comprobarPunto } from '../viabilidad';
import { notificarNovedades } from '../telegram/emision';
import {
  mapearViabilidad,
  rastrearBusqueda,
  viabilidadSinDatos,
  type ResultadoRastreo,
} from './rastreo';
import type { Busqueda, PuntoConPrecision } from '../types/locales';

export interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

const INTERVALO_MINUTOS = Number(process.env.LOCALES_INTERVALO_MINUTOS) || 15;
const PAGINAS_POR_PORTAL = Number(process.env.LOCALES_PAGINAS_POR_PORTAL) || 2;
const PAUSA_ENTRE_BUSQUEDAS_MS = 4_000;
const REFRESCO_PADRON_MS = 7 * 24 * 60 * 60 * 1_000;
const RECALCULO_POR_VUELTA = 40;

/** La primera vuelta de una búsqueda es línea base: se guarda pero no avisa. */
export function esPrimeraVuelta(busqueda: Pick<Busqueda, 'ultimo_rastreo'>): boolean {
  return busqueda.ultimo_rastreo === null || busqueda.ultimo_rastreo === undefined;
}

function proximaEsperaMs(): number {
  const base = INTERVALO_MINUTOS * 60_000;
  const jitter = base * 0.2;
  return Math.round(base - jitter + Math.random() * jitter * 2);
}

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let temporizador: NodeJS.Timeout | null = null;
let parado = false;
let enCurso = false;
let ultimoRefrescoPadron = Date.now();

async function estaEnMarcha(): Promise<boolean> {
  try {
    const { running } = await getScraperState();
    return running === true;
  } catch {
    // Base a medio inicializar: lo prudente es NO rastrear.
    return false;
  }
}

/** Una vuelta: todas las búsquedas rastreables, una detrás de otra. */
export async function ejecutarVuelta(log: Logger): Promise<ResultadoRastreo[]> {
  const busquedas = await listBusquedasRastreables();
  const resultados: ResultadoRastreo[] = [];

  for (const [indice, busqueda] of busquedas.entries()) {
    if (parado) break;
    if (indice > 0) await dormir(PAUSA_ENTRE_BUSQUEDAS_MS);

    const primeraVuelta = esPrimeraVuelta(busqueda);
    try {
      const resultado = await rastrearBusqueda(busqueda, {
        maxPaginas: PAGINAS_POR_PORTAL,
        notificarNovedades: !primeraVuelta,
      });
      resultados.push(resultado);

      log.info(
        `[${busqueda.nombre}] ${resultado.encontrados} encontrados, ${resultado.guardados} guardados, ` +
          `${resultado.novedades.length} novedades` +
          (primeraVuelta ? ' (primera vuelta: línea base, sin avisos)' : '') +
          (resultado.fallos.length > 0 ? `, ${resultado.fallos.length} portal(es) con fallo` : ''),
      );

      if (busqueda.notificar && resultado.novedades.length > 0) {
        const notificados = await notificarNovedades(resultado.novedades, busqueda.nombre, log);
        for (const id of notificados) await marcarNotificado(id);
      }
    } catch (err) {
      log.error(
        `Fallo rastreando "${busqueda.nombre}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return resultados;
}

/** Recalcula la viabilidad de un lote acotado. Nunca notifica. */
async function recalcularViabilidad(log: Logger): Promise<void> {
  let motor: string | null = null;
  try {
    motor = getMotor().nombre;
  } catch {
    return; // motor mal configurado: no es tarea de esta función avisarlo.
  }

  const filas = await anunciosParaRecalcular(motor, RECALCULO_POR_VUELTA);
  if (filas.length === 0) return;

  let hechos = 0;
  for (const fila of filas) {
    if (parado) break;
    try {
      if (fila.latitud === null || fila.longitud === null) {
        await actualizarViabilidad(fila.id, viabilidadSinDatos('El anuncio no publica una ubicación'));
        hechos++;
        continue;
      }
      const punto: PuntoConPrecision = {
        lat: fila.latitud,
        lng: fila.longitud,
        precision: fila.precision_coordenadas,
      };
      const resultado = await comprobarPunto(punto, {
        comunidad: fila.comunidad,
        provincia: fila.provincia,
        municipio: fila.municipio,
      });
      await actualizarViabilidad(fila.id, mapearViabilidad(resultado));
      hechos++;
    } catch (err) {
      log.warn(
        `No se pudo recalcular la viabilidad del anuncio ${fila.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  if (hechos > 0) log.info(`Viabilidad recalculada en ${hechos} anuncio(s).`);
}

/**
 * Refresco del padrón. Semanal desde `ciclo`, y una vez en el arranque si está
 * vacío (`arranque`). Defensivo hasta el absurdo: un import que falla no puede
 * tumbar el planificador.
 */
async function refrescarPadron(log: Logger, arranque = false): Promise<void> {
  if (!arranque && Date.now() - ultimoRefrescoPadron < REFRESCO_PADRON_MS) return;

  try {
    const comunidadesActuales = await comunidadesEnPadron();

    if (arranque) {
      // En el arranque solo se hace algo si el padrón está vacío: importar en
      // cada redespliegue castigaría a Overpass sin motivo.
      if (!(await padronVacio())) return;
    }
    ultimoRefrescoPadron = Date.now();

    let comunidades = comunidadesActuales;
    if (comunidades.length === 0) {
      // Arranque en frío: se siembra Madrid (la única con dataset oficial).
      comunidades = ['madrid'];
      log.warn('Padrón vacío: importando Madrid en segundo plano para tener línea base.');
    }

    for (const comunidad of comunidades) {
      try {
        const r = await importarComunidad(comunidad);
        log.info(
          `Padrón ${comunidad}: ${r.farmaciasImportadas} farmacias, ${r.centrosImportados} centros` +
            (r.errores.length > 0 ? ` (${r.errores.length} incidencia/s)` : ''),
        );
      } catch (err) {
        log.warn(
          `Refresco de padrón de ${comunidad} falló: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } catch (err) {
    log.warn(`Refresco de padrón falló: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function ciclo(log: Logger): Promise<void> {
  if (parado || enCurso) return;
  enCurso = true;

  try {
    if (await estaEnMarcha()) {
      await ejecutarVuelta(log);
      await refrescarPadron(log);
      await recalcularViabilidad(log);
    } else {
      log.info('Rastreador en pausa (scraper_state.running = false), vuelta omitida');
    }
  } catch (err) {
    log.error(`Fallo en la vuelta del rastreador: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    enCurso = false;
    if (!parado) {
      temporizador = setTimeout(() => void ciclo(log), proximaEsperaMs());
    }
  }
}

export function arrancarPlanificador(log: Logger): void {
  parado = false;
  log.info(
    `Rastreador programado cada ~${INTERVALO_MINUTOS} min (${PAGINAS_POR_PORTAL} pág/portal). ` +
      'Pausable desde la UI sin reiniciar el contenedor.',
  );

  // Arranque en frío del padrón, en segundo plano: no bloquea el arranque.
  void refrescarPadron(log, true).catch(() => undefined);

  // La primera vuelta espera un intervalo completo: arrancar rastreando haría
  // que cada redespliegue disparase peticiones a todos los portales a la vez.
  temporizador = setTimeout(() => void ciclo(log), proximaEsperaMs());
}

export function pararPlanificador(): void {
  parado = true;
  if (temporizador) {
    clearTimeout(temporizador);
    temporizador = null;
  }
}

/** Solo para tests: vuelve al estado inicial. */
export function _reset(): void {
  parado = false;
  enCurso = false;
  ultimoRefrescoPadron = Date.now();
  if (temporizador) {
    clearTimeout(temporizador);
    temporizador = null;
  }
}
