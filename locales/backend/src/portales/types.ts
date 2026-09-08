import type { AnuncioCrudo, TipoBusqueda } from '../types/locales';

/**
 * Los criterios de una búsqueda, en la forma que necesita un portal.
 *
 * Es deliberadamente un subconjunto de `busqueda`: un provider no sabe nada
 * de la comprobación de distancia ni de la viabilidad. El filtro fino (pie de
 * calle, rango exacto de facturación…) se aplica DESPUÉS, contra el anuncio ya
 * normalizado — porque ningún portal ofrece los mismos filtros y aplicarlos en
 * el buscador de cada uno daría resultados distintos según la fuente.
 */
export interface CriteriosPortal {
  tipo: TipoBusqueda;
  /** Lo que entienden Fotocasa/pisos.com/… como zona ("Badajoz", "Málaga"). */
  zonaTexto: string;
  comunidad: string | null;
  provincia: string | null;
  municipio: string | null;
  latitud: number | null;
  longitud: number | null;
  radioKm: number | null;
  precioMin: number | null;
  precioMax: number | null;
  superficieMin: number | null;
  superficieMax: number | null;
  /** `true` = solo a pie de calle; `null` = indiferente. */
  pieCalle: boolean | null;
  facturacionMin: number | null;
  facturacionMax: number | null;
}

export interface OpcionesBusqueda {
  /** Páginas de resultados a recorrer. Los portales ordenan por más reciente. */
  maxPaginas?: number;
  timeoutMs?: number;
}

export interface PortalProvider {
  readonly id: string;
  readonly nombre: string;
  /** Qué tipo de búsqueda cubre este portal: locales o farmacias. */
  readonly tipo: TipoBusqueda;
  /**
   * `true` si el portal puede buscar con estos criterios. milanuncios, por
   * ejemplo, no busca por coordenadas: si solo hay lat/lng y ninguna
   * provincia, devuelve el motivo en vez de buscar a ciegas.
   */
  puedeBuscar(criterios: CriteriosPortal): { ok: true } | { ok: false; motivo: string };
  buscar(criterios: CriteriosPortal, opciones?: OpcionesBusqueda): Promise<AnuncioCrudo[]>;
  /**
   * Para la función del bot de "reenvíame la URL de un anuncio": ¿esta URL es
   * de este portal y sé leerla? Un provider que no la implementa devuelve
   * `false` y `null` — el bot entonces prueba con el siguiente.
   */
  puedeParsearUrl(url: string): boolean;
  parsearUrl(url: string, opciones?: OpcionesBusqueda): Promise<AnuncioCrudo | null>;
}
