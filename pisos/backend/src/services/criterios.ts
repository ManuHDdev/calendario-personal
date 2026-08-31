/**
 * Filtro final: ¿este anuncio cumple lo que el propietario pidió?
 *
 * Se aplica en el backend, contra el anuncio ya normalizado, y no en el
 * buscador de cada portal. Dos razones:
 *
 *  1. Ningún portal ofrece el mismo juego de filtros. Wallapop no sabe qué
 *     es "3 habitaciones"; pisos.com y Fotocasa no filtran igual por baños.
 *     Delegar daría resultados distintos según la fuente para los mismos
 *     criterios.
 *  2. Los filtros del portal son un embudo previo (menos páginas que pedir),
 *     no la garantía. La garantía es esta función, y por eso es pura y está
 *     testeada.
 *
 * Principio transversal: un dato que el portal NO informa (`null`) nunca
 * descarta un anuncio. Solo descarta un dato conocido que incumple. Es la
 * diferencia entre "este piso no me vale" y "no sé si me vale", y en un
 * mercado donde los pisos buenos duran horas, prefiero mirar uno de más que
 * perder uno bueno en silencio.
 */

import type { AnuncioCrudo } from '../types/pisos';
import { normalizarTexto, ubicacionCoincide } from '../portales/normalizar';

export interface Criterios {
  /** Municipio buscado. El anuncio debe estar en él, no solo en su provincia. */
  ubicacion: string;
  precio_min: number | null;
  precio_max: number | null;
  metros_min: number | null;
  metros_max: number | null;
  habitaciones_min: number | null;
  banos_min: number | null;
  exige_ascensor: boolean;
  exige_garaje: boolean;
  exige_terraza: boolean;
  excluir_palabras: string | null;
}

export type Veredicto = { cumple: true } | { cumple: false; motivo: string };

/** Divide "subasta, okupa , nuda propiedad" en términos limpios y normalizados. */
export function parsearExclusiones(bruto: string | null): string[] {
  if (!bruto) return [];
  return bruto
    .split(',')
    .map((t) => normalizarTexto(t).trim())
    .filter((t) => t.length > 0);
}

function fueraDeRango(
  valor: number | null,
  min: number | null,
  max: number | null,
): 'bajo' | 'alto' | null {
  if (valor === null) return null;
  if (min !== null && valor < min) return 'bajo';
  if (max !== null && valor > max) return 'alto';
  return null;
}

export function cumpleCriterios(anuncio: AnuncioCrudo, criterios: Criterios): Veredicto {
  // La ubicación SÍ descarta, incluso cuando no se conoce: el propietario
  // busca un municipio concreto, no una provincia. Es la única excepción
  // junto al precio a la regla de "un dato desconocido no descarta" — y en
  // la práctica los tres portales siempre traen el municipio.
  if (!ubicacionCoincide(anuncio.ubicacion, criterios.ubicacion)) {
    return { cumple: false, motivo: `fuera de ${criterios.ubicacion}` };
  }

  // El precio SÍ descarta cuando no se conoce: un anuncio sin precio es
  // siempre un "consúltanos", y no es lo que se está buscando aquí.
  if (anuncio.precio === null && (criterios.precio_min !== null || criterios.precio_max !== null)) {
    return { cumple: false, motivo: 'sin precio publicado' };
  }

  const precio = fueraDeRango(anuncio.precio, criterios.precio_min, criterios.precio_max);
  if (precio) return { cumple: false, motivo: `precio ${precio === 'bajo' ? 'por debajo' : 'por encima'} del rango` };

  const metros = fueraDeRango(anuncio.metros, criterios.metros_min, criterios.metros_max);
  if (metros) return { cumple: false, motivo: `superficie ${metros === 'bajo' ? 'insuficiente' : 'excesiva'}` };

  if (
    criterios.habitaciones_min !== null &&
    anuncio.habitaciones !== null &&
    anuncio.habitaciones < criterios.habitaciones_min
  ) {
    return { cumple: false, motivo: 'menos habitaciones de las pedidas' };
  }

  if (criterios.banos_min !== null && anuncio.banos !== null && anuncio.banos < criterios.banos_min) {
    return { cumple: false, motivo: 'menos baños de los pedidos' };
  }

  // `false` = el anuncio dice explícitamente que no lo tiene → descarta.
  // `null` = el portal no lo informa → pasa, y ya se ve en la ficha.
  if (criterios.exige_ascensor && anuncio.ascensor === false) {
    return { cumple: false, motivo: 'sin ascensor' };
  }
  if (criterios.exige_garaje && anuncio.garaje === false) {
    return { cumple: false, motivo: 'sin garaje' };
  }
  if (criterios.exige_terraza && anuncio.terraza === false) {
    return { cumple: false, motivo: 'sin terraza' };
  }

  const exclusiones = parsearExclusiones(criterios.excluir_palabras);
  if (exclusiones.length > 0) {
    const texto = normalizarTexto(`${anuncio.titulo} ${anuncio.ubicacion ?? ''}`);
    const encontrada = exclusiones.find((termino) => texto.includes(termino));
    if (encontrada) return { cumple: false, motivo: `contiene "${encontrada}"` };
  }

  return { cumple: true };
}

/** Precio por metro cuadrado, si se conocen ambos. Útil para ordenar chollos. */
export function precioPorMetro(precio: number | null, metros: number | null): number | null {
  if (precio === null || metros === null || metros <= 0) return null;
  return Math.round(precio / metros);
}
