// Ranking client-side de los listings de "rentabilidad de alquiler por
// zona": una función pura y testeada que combina cada listing ya traído del
// backend (precio, metros, alquilerMensualEstimado) con los parámetros de
// financiación que el usuario edita en el formulario (entrada, TIN, gastos,
// etc.), usando `calcularAlquilerRentabilidad` — la misma función que ya usa
// la calculadora "Comprar para alquilar". Se extrae aparte de aquí (en vez de
// vivir inline en el componente) para poder testearla sin montar React, y
// porque re-rankear en cada tecleo de un campo debe ser instantáneo: ningún
// componente debería tener que reimplementar el orden ni el manejo de
// listings sin dato.

import {
  calcularAlquilerRentabilidad,
  calcularFlip,
  type AlquilerRentabilidadInput,
  type AlquilerRentabilidadResultado,
  type FlipInput,
  type FlipResultado,
} from './calculators';
import type { ModoRentabilidadZona, RentabilidadZonaListing } from '../services/api';

/** Los parámetros de financiación que el usuario edita, sin precio ni alquiler (vienen del listing). */
export type ParametrosFinanciacion = Omit<AlquilerRentabilidadInput, 'precioVivienda' | 'alquilerMensual'>;

export interface ListingConRentabilidad {
  listing: RentabilidadZonaListing;
  /** null cuando el listing no tiene alquiler estimado, o los parámetros no son válidos. */
  resultado: AlquilerRentabilidadResultado | null;
}

/**
 * Calcula la rentabilidad de cada listing con los parámetros dados y
 * devuelve la lista ordenada por rentabilidad neta sobre inversión
 * descendente. Los listings sin `alquilerMensualEstimado` (o cuyo cálculo
 * falla, p. ej. por un parámetro inválido) van al final, en el mismo orden
 * relativo en que llegaron — nunca se descartan en silencio, así la UI puede
 * seguir mostrándolos con un "sin datos suficientes".
 *
 * `gastosReformaPorListing` es un ajuste puramente client-side por listing
 * (clave = `listing.url`, la misma clave estable que ya se usa como `key` de
 * React en la lista): un "y si reformo ESTE piso" que solo sube el precio
 * efectivo usado para calcular SU rentabilidad, no una hipótesis global — un
 * listing sin entrada en el mapa usa 0, igual que hasta ahora.
 */
export function calcularRankingRentabilidad(
  listings: RentabilidadZonaListing[],
  parametros: ParametrosFinanciacion,
  gastosReformaPorListing: Record<string, number> = {},
): ListingConRentabilidad[] {
  const conResultado: ListingConRentabilidad[] = listings.map((listing) => {
    if (listing.alquilerMensualEstimado === null) {
      return { listing, resultado: null };
    }
    try {
      const gastosReforma = gastosReformaPorListing[listing.url] ?? 0;
      const resultado = calcularAlquilerRentabilidad({
        ...parametros,
        precioVivienda: listing.precio + gastosReforma,
        alquilerMensual: listing.alquilerMensualEstimado,
      });
      return { listing, resultado };
    } catch {
      return { listing, resultado: null };
    }
  });

  return [...conResultado].sort((a, b) => {
    if (a.resultado === null && b.resultado === null) return 0;
    if (a.resultado === null) return 1;
    if (b.resultado === null) return -1;
    return b.resultado.rentabilidadNetaSobreInversionPct - a.resultado.rentabilidadNetaSobreInversionPct;
  });
}

/**
 * Parámetros del modo "flip" que el usuario edita, sin precio de compra ni
 * precio de venta (vienen del listing y de `medianaVentaM2` de la zona,
 * respectivamente).
 */
export type ParametrosFlip = Omit<FlipInput, 'precioCompra' | 'precioVentaEstimado'>;

export interface ListingConFlip {
  listing: RentabilidadZonaListing;
  /** null cuando no hay medianaVentaM2 de la zona (AVM no disponible), o los parámetros no son válidos. */
  resultado: FlipResultado | null;
}

/**
 * Ranking del modo "flip" (comprar, reformar, vender). A diferencia de
 * `calcularRankingRentabilidad` (que reutiliza el `alquilerMensualEstimado`
 * ya calculado por listing), aquí el precio de venta estimado de CADA
 * listing se deriva de `medianaVentaM2` de la ZONA (un único valor de todo
 * el resultado, no por listing) multiplicado por los metros del propio
 * listing — el mismo AVM que ya alimenta `desviacionVsMedianaVentaPct`, sin
 * ningún dato nuevo. Por eso esta función es una función PARALELA a
 * `calcularRankingRentabilidad` en vez de un `modo` interno de la misma: la
 * entrada (`medianaVentaM2` de la zona, no del listing) y el tipo de
 * resultado (`FlipResultado`, sin cashflow ni hipoteca) son distintos de
 * los otros dos modos, que SÍ comparten forma de entrada/salida entre sí
 * (ambos usan `calcularAlquilerRentabilidad` con `alquilerMensualEstimado`
 * por listing). Forzar los tres modos en una sola función con un `modo`
 * interno habría obligado a un tipo de resultado unión en cada punto de uso
 * del componente, para un caso (flip) que en realidad no comparte forma con
 * los otros dos.
 *
 * Un listing sin `medianaVentaM2` de zona (AVM no disponible) va al final
 * con `resultado: null` — nunca se descarta ni se fabrica un precio de
 * venta inventado, mismo principio que el resto del módulo.
 */
/**
 * Forma unificada de un ítem del ranking, usada por el componente y por el
 * mapa (`RentabilidadZonaMapa`): discrimina por `kind` entre las dos formas
 * de resultado posibles (alquiler_completo/habitaciones comparten
 * `AlquilerRentabilidadResultado`; flip usa `FlipResultado`) — ver el
 * comentario de `calcularRankingFlip` sobre por qué son funciones paralelas
 * en vez de una sola con un `modo` interno.
 */
export type ItemRanking =
  | { listing: RentabilidadZonaListing; kind: 'alquiler'; resultado: AlquilerRentabilidadResultado | null }
  | { listing: RentabilidadZonaListing; kind: 'flip'; resultado: FlipResultado | null };

export function calcularRankingFlip(
  listings: RentabilidadZonaListing[],
  medianaVentaM2: number | null,
  parametros: ParametrosFlip,
  gastosReformaPorListing: Record<string, number> = {},
): ListingConFlip[] {
  const conResultado: ListingConFlip[] = listings.map((listing) => {
    if (medianaVentaM2 === null) {
      return { listing, resultado: null };
    }
    try {
      const gastosReforma = gastosReformaPorListing[listing.url] ?? 0;
      const precioVentaEstimado = medianaVentaM2 * listing.metros;
      const resultado = calcularFlip({
        ...parametros,
        precioCompra: listing.precio,
        gastosReforma,
        precioVentaEstimado,
      });
      return { listing, resultado };
    } catch {
      return { listing, resultado: null };
    }
  });

  return [...conResultado].sort((a, b) => {
    if (a.resultado === null && b.resultado === null) return 0;
    if (a.resultado === null) return 1;
    if (b.resultado === null) return -1;
    return b.resultado.margenSobreInversionPct - a.resultado.margenSobreInversionPct;
  });
}

/**
 * Texto del badge de `desviacionVsMedianaVentaPct`: "+12.3% vs. mediana de
 * la zona" (por encima) o "-8.2% vs. mediana de la zona" (por debajo). Un
 * valor negativo ya lleva su propio signo — solo se antepone "+" cuando
 * hace falta, nunca se duplica.
 */
export function formatearDesviacionVenta(pct: number): string {
  const signo = pct > 0 ? '+' : '';
  return `${signo}${pct.toFixed(1)}% vs. mediana de la zona`;
}

/**
 * Etiqueta del alquiler/ingreso estimado, sensible al modo: en
 * "alquiler_completo" es "Alquiler estimado" (como hasta ahora); en
 * "habitaciones" es "Ingreso estimado (N habitaciones)", para dejar claro
 * que la cifra suma varias habitaciones sueltas y no es comparable 1:1 con
 * un alquiler de piso completo. Sin dato de habitaciones (no debería
 * ocurrir: un listing sin habitaciones se excluye en modo habitaciones antes
 * de llegar aquí) cae a "Ingreso estimado" a secas.
 */
export function etiquetaAlquilerEstimado(modo: ModoRentabilidadZona, habitaciones: number | null): string {
  if (modo !== 'habitaciones') return 'Alquiler estimado';
  return habitaciones !== null ? `Ingreso estimado (${habitaciones} habitaciones)` : 'Ingreso estimado';
}
