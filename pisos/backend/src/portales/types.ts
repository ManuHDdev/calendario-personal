import type { AnuncioCrudo, PortalId } from '../types/pisos';

/**
 * Los criterios de una búsqueda, en la forma que necesita un portal.
 *
 * Es deliberadamente un subconjunto de `Busqueda`: un provider no sabe nada
 * de exigencias (ascensor, garaje…) ni de palabras excluidas. Todo eso se
 * aplica DESPUÉS, en `services/criterios.ts`, contra el anuncio ya
 * normalizado — porque ningún portal ofrece los mismos filtros y aplicarlos
 * en el servidor de cada uno daría resultados distintos según la fuente.
 */
export interface CriteriosPortal {
  ubicacion: string;
  latitud: number | null;
  longitud: number | null;
  radioKm: number | null;
  precioMin: number | null;
  precioMax: number | null;
  metrosMin: number | null;
  metrosMax: number | null;
  habitacionesMin: number | null;
  banosMin: number | null;
}

export interface OpcionesBusqueda {
  /** Páginas de resultados a recorrer. Los portales ordenan por más reciente. */
  maxPaginas?: number;
  timeoutMs?: number;
}

export interface PortalProvider {
  readonly id: PortalId;
  readonly nombre: string;
  /**
   * `true` si el portal puede buscar con estos criterios. Wallapop, por
   * ejemplo, necesita coordenadas: sin ellas devuelve el motivo en vez de
   * buscar a ciegas por toda España.
   */
  puedeBuscar(criterios: CriteriosPortal): { ok: true } | { ok: false; motivo: string };
  buscar(criterios: CriteriosPortal, opciones?: OpcionesBusqueda): Promise<AnuncioCrudo[]>;
}
