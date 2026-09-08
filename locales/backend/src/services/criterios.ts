/**
 * Filtro final: ¿este anuncio cumple lo que se pidió en la búsqueda?
 *
 * Se aplica en el backend, contra el anuncio ya normalizado, y no delegando en
 * el buscador de cada portal — ninguno ofrece el mismo juego de filtros, y el
 * filtro del portal es solo un embudo, no la garantía.
 *
 * Principio transversal (igual que en `pisos`): un dato que el portal NO
 * informa (`null`) nunca descarta un anuncio. Solo descarta un dato conocido
 * que incumple. Las dos excepciones son la ubicación (es el eje de la
 * búsqueda) y el precio cuando hay filtro de precio (un "consúltanos" no sirve
 * para buscar por presupuesto).
 */

import type { AnuncioCrudo, Busqueda, TipoBusqueda } from '../types/locales';
import { ubicacionCoincide } from '../portales/normalizar';

export interface Criterios {
  tipo: TipoBusqueda;
  /** Texto de zona buscado (municipio o, en su defecto, provincia/comunidad). */
  zona: string | null;
  municipio: string | null;
  provincia: string | null;
  comunidad: string | null;
  precioMin: number | null;
  precioMax: number | null;
  superficieMin: number | null;
  superficieMax: number | null;
  /** `true` = solo a pie de calle; `null` = indiferente. */
  pieCalle: boolean | null;
  facturacionMin: number | null;
  facturacionMax: number | null;
}

export type Veredicto = { cumple: true } | { cumple: false; motivo: string };

export function criteriosDeBusqueda(b: Busqueda): Criterios {
  return {
    tipo: b.tipo,
    zona: b.zona_texto ?? b.municipio ?? null,
    municipio: b.municipio,
    provincia: b.provincia,
    comunidad: b.comunidad,
    precioMin: b.precio_min,
    precioMax: b.precio_max,
    superficieMin: b.superficie_min,
    superficieMax: b.superficie_max,
    pieCalle: b.pie_calle,
    facturacionMin: b.facturacion_min,
    facturacionMax: b.facturacion_max,
  };
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

/**
 * Texto contra el que se comprueba la coincidencia de ubicación.
 *
 * Para un local se prioriza el municipio; para una farmacia intermediada, que
 * a menudo solo llega con una provincia o comunidad difusa ("sur de la
 * Comunidad de Madrid"), vale con casar la parte de provincia/comunidad.
 */
function objetivoUbicacion(c: Criterios): string {
  if (c.tipo === 'farmacia') {
    return c.municipio ?? c.provincia ?? c.comunidad ?? c.zona ?? '';
  }
  return c.municipio ?? c.zona ?? c.provincia ?? '';
}

function ubicacionDelAnuncio(a: AnuncioCrudo, incluirAmplio: boolean): string {
  const partes = [a.municipio, a.direccion];
  // Para una farmacia intermediada, que a menudo solo trae provincia/comunidad,
  // también valen esas partes. Para un local NO: se busca un municipio concreto
  // y "Mérida, Badajoz" no debe casar con una búsqueda de "Badajoz".
  if (incluirAmplio) partes.push(a.provincia, a.comunidad);
  return partes.filter(Boolean).join(', ');
}

function esPieDeCalleTexto(a: AnuncioCrudo): boolean | null {
  const t = `${a.titulo} ${a.descripcion ?? ''}`.toLowerCase();
  if (/\ba\s+pie\s+de\s+calle\b|\bplanta\s+calle\b|\bplanta\s+baja\b/.test(t)) return true;
  if (/\b(primera|segunda|1|2)\s*ª?\s*planta\b|\bentreplanta\b|\bs[oó]tano\b|\baltillo\b|\bplanta\s+alta\b/.test(t)) {
    return false;
  }
  return null;
}

export function cumpleCriterios(anuncio: AnuncioCrudo, criterios: Criterios): Veredicto {
  // 1) Ubicación: SÍ descarta aunque el dato no se conozca. Se busca una zona
  //    concreta, no "cualquier sitio".
  const objetivo = objetivoUbicacion(criterios);
  const ubic = ubicacionDelAnuncio(anuncio, criterios.tipo === 'farmacia') || null;
  if (objetivo && !ubicacionCoincide(ubic, objetivo)) {
    return { cumple: false, motivo: `fuera de ${objetivo}` };
  }

  // 2) Precio: SÍ descarta cuando no se conoce y hay filtro de precio.
  if (
    anuncio.precio === null &&
    (criterios.precioMin !== null || criterios.precioMax !== null)
  ) {
    return { cumple: false, motivo: 'sin precio publicado' };
  }
  const precio = fueraDeRango(anuncio.precio, criterios.precioMin, criterios.precioMax);
  if (precio) {
    return {
      cumple: false,
      motivo: `precio ${precio === 'bajo' ? 'por debajo' : 'por encima'} del rango`,
    };
  }

  // 3) Local: superficie y pie de calle.
  const superficie = fueraDeRango(
    anuncio.superficieM2,
    criterios.superficieMin,
    criterios.superficieMax,
  );
  if (superficie) {
    return {
      cumple: false,
      motivo: `superficie ${superficie === 'bajo' ? 'insuficiente' : 'excesiva'}`,
    };
  }
  if (criterios.pieCalle === true && esPieDeCalleTexto(anuncio) === false) {
    return { cumple: false, motivo: 'no está a pie de calle' };
  }

  // 4) Farmacia: facturación.
  const facturacion = fueraDeRango(
    anuncio.facturacion,
    criterios.facturacionMin,
    criterios.facturacionMax,
  );
  if (facturacion) {
    return {
      cumple: false,
      motivo: `facturación ${facturacion === 'bajo' ? 'por debajo' : 'por encima'} del rango`,
    };
  }

  return { cumple: true };
}

/** Precio por metro cuadrado, si se conocen ambos. */
export function precioPorMetro(precio: number | null, superficie: number | null): number | null {
  if (precio === null || superficie === null || superficie <= 0) return null;
  return Math.round(precio / superficie);
}
