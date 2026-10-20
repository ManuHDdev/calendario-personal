import type { Camara } from '../types';

/** Minúsculas y sin tildes, para que "merida" encuentre "Mérida". */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Búsqueda local por nombre o carretera; cada palabra de la consulta debe aparecer. */
export function coincide(camara: Pick<Camara, 'nombre' | 'carretera'>, consulta: string): boolean {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return true;
  const pajar = normalizar(`${camara.nombre} ${camara.carretera ?? ''}`);
  return palabras.every((p) => pajar.includes(p));
}
