/**
 * Emisión de avisos de novedades por Telegram.
 *
 * Reutiliza `avisar()` del bot de doble sentido (no abre un segundo cliente).
 * Un envío que falla NO devuelve su id: quien llama entonces no lo marca como
 * notificado y se reintenta en la siguiente vuelta, en vez de perderse.
 *
 * Rojo y sin_datos no se emiten como alerta: un rojo cuesta una oportunidad,
 * pero saturar el móvil con locales que no cumplen hace que se dejen de mirar
 * los avisos. Se filtran aquí.
 */

import { avisar } from './bot';
import { formatearNovedad } from './formato';
import type { NovedadAnuncio } from '../services/rastreo';

const VEREDICTOS_AVISABLES = new Set(['verde', 'ambar']);

export async function notificarNovedades(
  novedades: NovedadAnuncio[],
  nombreBusqueda: string,
  log?: { warn: (m: string) => void },
): Promise<number[]> {
  const avisables = novedades.filter((n) => VEREDICTOS_AVISABLES.has(n.anuncio.veredicto));
  if (avisables.length === 0) return [];

  const enviados: number[] = [];
  for (const novedad of avisables) {
    try {
      const ok = await avisar(formatearNovedad(novedad, nombreBusqueda));
      if (ok) enviados.push(novedad.anuncio.id);
      else log?.warn(`No se pudo avisar del anuncio ${novedad.anuncio.id} (Telegram no disponible)`);
    } catch (err) {
      log?.warn(
        `Fallo avisando del anuncio ${novedad.anuncio.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return enviados;
}
