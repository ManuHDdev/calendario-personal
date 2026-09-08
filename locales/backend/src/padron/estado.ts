/**
 * Estado compartido de UNA importación de padrón en curso.
 *
 * Es el candado único que impide que el refresco semanal del planificador y una
 * importación lanzada a mano desde la UI corran a la vez sobre las mismas
 * tablas. Vive en memoria del proceso: como el resto de la app, `locales` es una
 * única instancia Docker.
 *
 * Reglas heredadas del CLI (`cli.ts`): un fallo en una comunidad NUNCA aborta el
 * resto, y un import parcial nunca se trata como completo — cada comunidad deja
 * su resultado (ok o error) en `hechas`.
 */

import { importarComunidad, recalcularCobertura } from './importar';

export type OrigenPadron = 'manual' | 'planificador';

export type EstadoPadron = {
  estado: 'inactivo' | 'importando';
  iniciadoEn: string | null;
  origen: OrigenPadron | null;
  cola: string[];
  comunidadActual: string | null;
  hechas: Array<{ comunidad: string; ok: boolean; resumen?: unknown; error?: string }>;
};

export interface LoggerPadron {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

function inactivo(): EstadoPadron {
  return {
    estado: 'inactivo',
    iniciadoEn: null,
    origen: null,
    cola: [],
    comunidadActual: null,
    hechas: [],
  };
}

let estado: EstadoPadron = inactivo();

/** Copia defensiva: nadie de fuera muta el singleton. */
export function getEstadoPadron(): EstadoPadron {
  return {
    ...estado,
    cola: [...estado.cola],
    hechas: estado.hechas.map((h) => ({ ...h })),
  };
}

/**
 * Intenta tomar el candado. Devuelve `false` si ya hay una importación en curso
 * (sea manual o del planificador). Al tomarlo, limpia los resultados previos.
 */
export function intentarReservar(origen: OrigenPadron): boolean {
  if (estado.estado === 'importando') return false;
  estado = {
    estado: 'importando',
    iniciadoEn: new Date().toISOString(),
    origen,
    cola: [],
    comunidadActual: null,
    hechas: [],
  };
  return true;
}

/**
 * Suelta el candado. Conserva `hechas` e `iniciadoEn` como registro de la última
 * pasada: la UI los sigue mostrando después de terminar, hasta que la siguiente
 * reserva los limpie.
 */
export function liberar(): void {
  estado = { ...estado, estado: 'inactivo', cola: [], comunidadActual: null };
}

/** Solo para tests: vuelve al estado inicial. */
export function _reset(): void {
  estado = inactivo();
}

/**
 * Procesa la cola de comunidades, una a una, y recalcula la cobertura al final.
 * Pensada para lanzarse desprendida (`void procesarCola(...)`): el que la llama
 * ya ha respondido al cliente.
 *
 * Se auto-cura el estado por si se llamó sin `intentarReservar` previo, pero el
 * flujo normal es reservar y luego procesar.
 */
export async function procesarCola(
  comunidades: string[],
  origen: OrigenPadron,
  log?: LoggerPadron,
): Promise<void> {
  estado.estado = 'importando';
  estado.origen = origen;
  if (!estado.iniciadoEn) estado.iniciadoEn = new Date().toISOString();
  estado.cola = [...comunidades];
  estado.comunidadActual = null;
  estado.hechas = [];

  try {
    while (estado.cola.length > 0) {
      const comunidad = estado.cola.shift() as string;
      estado.comunidadActual = comunidad;
      try {
        const resumen = await importarComunidad(comunidad);
        estado.hechas.push({ comunidad, ok: true, resumen });
        log?.info(`Padrón ${comunidad}: importado.`);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        estado.hechas.push({ comunidad, ok: false, error });
        // Un import parcial nunca debe parecerse a uno completo.
        log?.warn(`Padrón ${comunidad} falló: ${error}`);
      }
    }
    estado.comunidadActual = null;

    // La cobertura se recalcula al final, siempre: es la salvaguarda contra el
    // falso verde y no puede quedarse obsoleta tras un import.
    try {
      await recalcularCobertura();
    } catch (err) {
      log?.warn(
        `Recalcular la cobertura del padrón falló: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } finally {
    liberar();
  }
}
