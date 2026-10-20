import type { CamaraDgt } from './dgtParser';
import { asignarCiudad, CIUDADES } from './ciudades';

export interface CamaraCercana {
  camara: CamaraDgt;
  ciudad: string;
  distanciaKm: number;
}

/** Las cámaras del feed que caen dentro del radio de alguna ciudad, con su ciudad y distancia. */
export function filtrarCercanas(camaras: CamaraDgt[]): CamaraCercana[] {
  const salida: CamaraCercana[] = [];
  for (const camara of camaras) {
    const asignada = asignarCiudad(camara.latitud, camara.longitud);
    if (asignada) salida.push({ camara, ciudad: asignada.ciudad.slug, distanciaKm: asignada.distanciaKm });
  }
  return salida;
}

export function contarPorCiudad(cercanas: CamaraCercana[]): Record<string, number> {
  const cuenta: Record<string, number> = Object.fromEntries(CIUDADES.map((c) => [c.slug, 0]));
  for (const c of cercanas) cuenta[c.ciudad] += 1;
  return cuenta;
}

export interface ResumenCobertura {
  totalFeed: number;
  totalCercanas: number;
  porCiudad: Record<string, number>;
  conCarretera: number;
  /** Cámaras cuyo nombre es el genérico "Cámara …" (el feed no traía descripción). */
  sinNombreReal: number;
}

/**
 * Cobertura por campo del feed — la métrica real, igual que en `pisos`: un
 * parser medio roto devuelve cámaras con todo a `null` y aun así "funciona".
 */
export function resumirCobertura(feed: CamaraDgt[]): ResumenCobertura {
  const cercanas = filtrarCercanas(feed);
  return {
    totalFeed: feed.length,
    totalCercanas: cercanas.length,
    porCiudad: contarPorCiudad(cercanas),
    conCarretera: cercanas.filter((c) => c.camara.carretera !== null).length,
    sinNombreReal: cercanas.filter((c) => c.camara.nombre.startsWith('Cámara ')).length,
  };
}
