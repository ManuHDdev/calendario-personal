import type { Busqueda, ActiveSearchDto } from '../types/busqueda';

/**
 * Mapea una fila de `busqueda` al DTO estable consumido por
 * marketplace-watcher (ver design.md — "GET /ofertas/api/searches/active is
 * a stable, explicit response DTO, not a raw row dump"). Deliberadamente NO
 * es un `SELECT *` serializado: las columnas internas (`id`, nombres en
 * español, timestamps) pueden cambiar sin romper el contrato del scraper.
 */
export function toActiveSearchDto(row: Busqueda): ActiveSearchDto {
  return {
    name: row.nombre,
    keyword: row.keyword,
    max_price: row.precio_max,
    min_price: row.precio_min,
    latitude: row.latitude,
    longitude: row.longitude,
    distance_km: row.distance_km,
    milanuncios_province_slug: row.milanuncios_province_slug,
    language_filter: row.language_filter,
    sites: row.sitios,
  };
}
