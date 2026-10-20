import type { EstadoImportacion } from '../types';
import { haceCuanto } from './tiempo';

export interface ResumenEstado {
  nivel: 'neutro' | 'ok' | 'error';
  texto: string;
}

/**
 * Una importación fallida NUNCA debe parecerse a una buena: la última
 * importación puede haber fallado mientras el catálogo antiguo sigue ahí.
 */
export function resumirEstado(e: EstadoImportacion | null, ahora: Date = new Date()): ResumenEstado {
  if (!e || !e.ultimaEjecucion) {
    return { nivel: 'neutro', texto: 'El catálogo de la DGT aún no se ha importado' };
  }
  const cuando = haceCuanto(e.ultimaEjecucion, ahora);
  if (e.ok === false) {
    return { nivel: 'error', texto: `La última importación de la DGT falló (${cuando}): ${e.error ?? 'error desconocido'}` };
  }
  return {
    nivel: 'ok',
    texto: `Catálogo DGT actualizado ${cuando} · ${e.totalCercanas ?? 0} cámaras de ${e.totalFeed ?? 0} en el feed`,
  };
}
