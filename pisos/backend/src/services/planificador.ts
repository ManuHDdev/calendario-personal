/**
 * El planificador es lo que hace que esta app sirva de algo.
 *
 * Un piso barato en España dura horas, así que el valor está en que alguien
 * mire cada pocos minutos SIN que haya que pedírselo. Por eso el bucle vive
 * dentro del propio contenedor del backend (`setTimeout` encadenado) y no en
 * un cron externo ni en ningún asistente: mientras el contenedor esté
 * levantado, rastrea; y el contenedor arranca con `restart: unless-stopped`.
 *
 * Se encadena con `setTimeout` en lugar de usar `setInterval` a propósito:
 * un rastreo que tarde más que el intervalo no debe solaparse consigo mismo.
 */

import { pool } from '../db/pool';
import { listBusquedasRastreables, getScraperState, marcarNotificado } from '../db/queries';
import { rastrearBusqueda, type ResultadoRastreo } from './rastreo';
import { normalizarFila } from '../db/filas';
import { notificarNovedades } from '../telegram/notificador';
import type { Busqueda } from '../types/pisos';

export interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

/**
 * La PRIMERA vuelta de una búsqueda trae decenas de pisos que llevan meses
 * publicados: no son novedades y avisar de todos revienta el móvil con cien
 * mensajes de golpe. Esa vuelta se guarda como línea base y a partir de la
 * siguiente ya se avisa de lo que aparezca nuevo. Mismo motivo por el que
 * "Buscar ahora" tampoco notifica. `ultimo_rastreo_at` lo deja NOW() el
 * primer `marcarRastreo`, así que es null exactamente una vez.
 */
export function esPrimeraVuelta(busqueda: Pick<Busqueda, 'ultimo_rastreo_at'>): boolean {
  return busqueda.ultimo_rastreo_at === null;
}

const INTERVALO_MINUTOS = Number(process.env.PISOS_INTERVALO_MINUTOS) || 15;
const PAGINAS_POR_PORTAL = Number(process.env.PISOS_PAGINAS_POR_PORTAL) || 2;

/**
 * Espera entre búsquedas dentro de una misma vuelta. Lanzar diez búsquedas a
 * la vez contra el mismo portal es la forma más rápida de que ese portal
 * empiece a devolver 429.
 */
const PAUSA_ENTRE_BUSQUEDAS_MS = 4_000;

/**
 * Desviación aleatoria sobre el intervalo (±20%). Un rastreo que cae siempre
 * en el mismo segundo es un patrón perfectamente reconocible; repartirlo un
 * poco no cuesta nada y se parece más a una persona mirando.
 */
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

async function estaEnMarcha(): Promise<boolean> {
  const { text, values } = getScraperState();
  const { rows } = await pool.query<{ running: boolean }>(text, values);
  // Si la fila no existiese (base a medio inicializar), lo prudente es NO
  // rastrear: es más fácil de diagnosticar que un rastreo fantasma.
  return rows[0]?.running === true;
}

async function busquedasRastreables(): Promise<Busqueda[]> {
  const { text, values } = listBusquedasRastreables();
  const { rows } = await pool.query<Busqueda>(text, values);
  return rows.map(normalizarFila);
}

/** Una vuelta completa: todas las búsquedas rastreables, una detrás de otra. */
export async function ejecutarVuelta(log: Logger): Promise<ResultadoRastreo[]> {
  const busquedas = await busquedasRastreables();
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
        for (const id of notificados) {
          const marca = marcarNotificado(id);
          await pool.query(marca.text, marca.values);
        }
      }
    } catch (err) {
      // Una búsqueda que revienta no puede llevarse por delante a las demás
      // ni al bucle: se registra y se sigue con la siguiente.
      log.error(
        `Fallo rastreando "${busqueda.nombre}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return resultados;
}

async function ciclo(log: Logger): Promise<void> {
  if (parado || enCurso) return;
  enCurso = true;

  try {
    if (await estaEnMarcha()) {
      await ejecutarVuelta(log);
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
  // La primera vuelta espera un intervalo: arrancar rastreando haría que
  // cada redespliegue disparase peticiones a los tres portales a la vez.
  temporizador = setTimeout(() => void ciclo(log), proximaEsperaMs());
}

export function pararPlanificador(): void {
  parado = true;
  if (temporizador) {
    clearTimeout(temporizador);
    temporizador = null;
  }
}
