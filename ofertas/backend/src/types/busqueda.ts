export interface SiteConfig {
  enabled: boolean;
}

export interface Sitios {
  wallapop: SiteConfig;
  milanuncios: SiteConfig;
  vinted: SiteConfig;
}

export interface Busqueda {
  id: string;
  nombre: string;
  keyword: string;
  precio_min: number | null;
  precio_max: number | null;
  latitude: number;
  longitude: number;
  distance_km: number;
  milanuncios_province_slug: string | null;
  language_filter: string | null;
  exclude_keywords: string | null;
  console_only: boolean;
  sitios: Sitios;
  /**
   * Activar/desactivar una búsqueda concreta sin borrarla ni tocar el
   * on/off global del scraper (scraper_state). Distinto de `activo`
   * (borrado lógico): una búsqueda deshabilitada sigue existiendo y
   * visible en el panel admin, solo se excluye de /searches/active.
   */
  habilitada: boolean;
  activo: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * DTO expuesto por GET /ofertas/api/searches/active. Los nombres de campo
 * imitan deliberadamente el `SearchQuery`/`config.yaml` que ya usa
 * marketplace-watcher (ver design.md) — NO son un volcado de las columnas
 * internas de `busqueda`.
 */
export interface ActiveSearchDto {
  name: string;
  keyword: string;
  max_price: number | null;
  min_price: number | null;
  latitude: number;
  longitude: number;
  distance_km: number;
  milanuncios_province_slug: string | null;
  language_filter: string | null;
  exclude_keywords: string | null;
  console_only: boolean;
  sites: Sitios;
}
