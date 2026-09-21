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
  type AlquilerRentabilidadInput,
  type AlquilerRentabilidadResultado,
} from './calculators';
import type { RentabilidadZonaListing } from '../services/api';

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
