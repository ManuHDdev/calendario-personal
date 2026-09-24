/**
 * Las 9 zonas de España que cubre Inside Airbnb, verificadas en vivo contra
 * la página real "Get the Data" el 2026-09-24 (no contra un resumen
 * cacheado, que solo listaba 7 — Sevilla y Valencia también están
 * publicadas). Mismo criterio que `capitales.ts`: un mapa a mano es más
 * fiable que derivar la lista dinámicamente de lo que la página tenga en
 * cada momento — si Inside Airbnb deja de publicar una ciudad, su último
 * snapshot se queda tal cual en la base de datos (con su fecha, visible),
 * en vez de desaparecer en silencio del selector; añadir una ciudad nueva
 * que empiece a publicarse es un cambio de una línea aquí, no automático.
 *
 * `slug` es el segmento de ciudad en la URL de Inside Airbnb
 * (`data.insideairbnb.com/spain/<región>/<slug>/...`), usado para
 * emparejar cada enlace extraído de la página con su ciudad.
 */
export interface CiudadAirbnb {
  slug: string;
  nombre: string;
  region: string;
}

export const CIUDADES_AIRBNB: CiudadAirbnb[] = [
  { slug: 'madrid', nombre: 'Madrid', region: 'Comunidad de Madrid' },
  { slug: 'barcelona', nombre: 'Barcelona', region: 'Cataluña' },
  { slug: 'girona', nombre: 'Girona', region: 'Cataluña' },
  { slug: 'malaga', nombre: 'Málaga', region: 'Andalucía' },
  { slug: 'mallorca', nombre: 'Mallorca', region: 'Islas Baleares' },
  { slug: 'menorca', nombre: 'Menorca', region: 'Islas Baleares' },
  { slug: 'euskadi', nombre: 'Euskadi', region: 'País Vasco' },
  { slug: 'sevilla', nombre: 'Sevilla', region: 'Andalucía' },
  { slug: 'valencia', nombre: 'Valencia', region: 'Comunidad Valenciana' },
];

export function esCiudadAirbnbSoportada(slug: string): boolean {
  return CIUDADES_AIRBNB.some((c) => c.slug === slug);
}
