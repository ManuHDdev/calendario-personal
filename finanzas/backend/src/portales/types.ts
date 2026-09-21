/**
 * Tipos del módulo de portales — copia adaptada de `pisos/backend/src/portales/types.ts`.
 *
 * A diferencia de `pisos`, este módulo no depende de un tipo de dominio
 * externo (`../types/pisos`): `finanzas` no tiene búsquedas guardadas ni
 * anuncios persistidos uno a uno, solo necesita el resultado crudo de un
 * portal para promediar precio/m². Por eso `AnuncioCrudo`, `PortalId` y
 * `TipoInmueble` viven aquí en vez de importarse de un módulo de dominio de
 * `pisos` que no existe en este subapp.
 *
 * `finanzas` solo usa Fotocasa y pisos.com (nunca Wallapop, que en `pisos`
 * necesita coordenadas+radio en vez de nombre de zona — el scraper de
 * capitales busca siempre por nombre de ciudad).
 */

export const PORTALES = ['fotocasa', 'pisos'] as const;
export type PortalId = (typeof PORTALES)[number];

/**
 * Tipo de inmueble. Se mantiene el mismo union que `pisos` (`vivienda` |
 * `local`) para poder copiar `fotocasa.ts`/`pisoscom.ts` tal cual, aunque el
 * scraper de capitales de `finanzas` solo use `'vivienda'`.
 */
export const TIPOS = ['vivienda', 'local'] as const;
export type TipoInmueble = (typeof TIPOS)[number];

/**
 * Operación: venta o alquiler. Dimensión ortogonal a `TipoInmueble` — decide
 * la sección del portal (comprar/alquiler) y, en Fotocasa, el
 * `transactionTypeId` esperado del nodo. El scraper de capitales de
 * `finanzas` solo usa `'venta'`; `rentabilidadZona.ts` usa ambas.
 */
export const TIPOS_OPERACION = ['venta', 'alquiler'] as const;
export type TipoOperacion = (typeof TIPOS_OPERACION)[number];

/**
 * Un anuncio tal y como lo devuelve un portal, antes de tocar la base de
 * datos. Todo lo que un portal puede no informar viaja como `null`, nunca
 * como un valor inventado por defecto.
 */
export interface AnuncioCrudo {
  tipo: TipoInmueble;
  portal: PortalId;
  portalId: string;
  url: string;
  titulo: string;
  precio: number | null;
  metros: number | null;
  habitaciones: number | null;
  banos: number | null;
  planta: string | null;
  ascensor: boolean | null;
  garaje: boolean | null;
  terraza: boolean | null;
  ubicacion: string | null;
  latitud: number | null;
  longitud: number | null;
  imagenUrl: string | null;
}

/**
 * Los criterios de una búsqueda, en la forma que necesita un portal.
 *
 * Es deliberadamente un subconjunto: un provider no sabe nada de exigencias
 * (ascensor, garaje…) ni de palabras excluidas — eso no existe en el scraper
 * de capitales, que solo necesita ubicación para tomar una muestra.
 */
export interface CriteriosPortal {
  /** Tipo de inmueble: decide la sección del portal y el filtro de subtipos. */
  tipo: TipoInmueble;
  /** Venta o alquiler: decide la sección del portal (comprar/alquiler). */
  operacion: TipoOperacion;
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
   * `true` si el portal puede buscar con estos criterios.
   */
  puedeBuscar(criterios: CriteriosPortal): { ok: true } | { ok: false; motivo: string };
  buscar(criterios: CriteriosPortal, opciones?: OpcionesBusqueda): Promise<AnuncioCrudo[]>;
}
