import { distanciaKm } from './geo';

export interface Ciudad {
  slug: string;
  nombre: string;
  latitud: number;
  longitud: number;
  /** Radio (km) alrededor del centro dentro del que una cámara de carretera se considera "de" esta ciudad. */
  radioKm: number;
}

// Lista fija, mismo criterio que `capitales.ts` en finanzas: la geografía no
// cambia entre despliegues, así que un mapa a mano es más fiable que derivarlo.
// Añadir una ciudad es añadir una entrada aquí (y nada más: el esquema guarda
// el slug como texto, no como enum de base de datos).
export const CIUDADES: readonly Ciudad[] = [
  { slug: 'caceres',                  nombre: 'Cáceres',                  latitud: 39.4765, longitud: -6.3722, radioKm: 25 },
  { slug: 'badajoz',                  nombre: 'Badajoz',                  latitud: 38.8794, longitud: -6.9707, radioKm: 25 },
  { slug: 'merida',                   nombre: 'Mérida',                   latitud: 38.9161, longitud: -6.3437, radioKm: 25 },
  { slug: 'villanueva-de-la-serena',  nombre: 'Villanueva de la Serena',  latitud: 38.9764, longitud: -5.7969, radioKm: 20 },
] as const;

export const SLUGS_CIUDAD = CIUDADES.map((c) => c.slug) as [string, ...string[]];

export function ciudadPorSlug(slug: string): Ciudad | undefined {
  return CIUDADES.find((c) => c.slug === slug);
}

/**
 * Ciudad más cercana cuyo radio contiene el punto, o `null` si el punto no cae
 * dentro de ninguna. Gana la más cercana (no la primera de la lista) para que
 * dos radios solapados no dependan del orden en que estén declaradas.
 */
export function asignarCiudad(latitud: number, longitud: number): { ciudad: Ciudad; distanciaKm: number } | null {
  let mejor: { ciudad: Ciudad; distanciaKm: number } | null = null;
  for (const ciudad of CIUDADES) {
    const d = distanciaKm(latitud, longitud, ciudad.latitud, ciudad.longitud);
    if (d <= ciudad.radioKm && (!mejor || d < mejor.distanciaKm)) {
      mejor = { ciudad, distanciaKm: d };
    }
  }
  return mejor;
}
