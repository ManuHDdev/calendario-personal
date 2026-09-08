/**
 * Fusión de fuentes del padrón.
 *
 * El padrón se llena de varias fuentes a la vez (OpenStreetMap para toda
 * España, más el dato oficial de cada comunidad donde exista abierto). La misma
 * farmacia aparece en dos sitios con coordenadas que difieren unos metros, y
 * contarla dos veces inflaría artificialmente la cobertura de su municipio —
 * justo la métrica que impide emitir falsos verdes.
 *
 * La decisión de qué es un duplicado es pura y está aquí para poder testearla
 * sin base de datos.
 */

import { haversineM } from '../viabilidad/geo';
import type { LatLng } from '../types/locales';

/**
 * Radio por debajo del cual dos registros son la misma farmacia.
 *
 * 40 m es aproximadamente el ancho de una manzana estrecha: por debajo, dos
 * puntos con el mismo nombre casi seguro son el mismo local geocodificado por
 * dos caminos distintos. Subirlo empezaría a fusionar farmacias vecinas
 * legítimas, que en casco urbano pueden estar a 250 m justos.
 */
export const RADIO_DUPLICADO_M = 40;

/**
 * Confianza por fuente: gana la más alta al fusionar.
 *
 * El dato oficial de la comunidad manda sobre OSM porque es el registro
 * administrativo del que salen las autorizaciones; OSM es la capa que da
 * cobertura nacional uniforme donde no hay dato oficial abierto.
 */
export function confianzaFuente(fuente: string): number {
  if (fuente.startsWith('oficial_')) return 2;
  if (fuente === 'osm') return 1;
  return 0;
}

export interface RegistroPadron extends LatLng {
  id: number;
  fuente: string;
  nombre: string | null;
}

export interface DecisionFusion {
  /** Fila que se conserva como buena. */
  supervivienteId: number;
  /** Filas que quedan marcadas como duplicado de la anterior. */
  duplicadosIds: number[];
}

/**
 * Agrupa registros que describen el mismo establecimiento.
 *
 * Agrupación transitiva simple (si A~B y B~C, los tres al mismo grupo). Con
 * radios pequeños frente a la separación legal entre farmacias no encadena
 * grupos largos, y es mucho más predecible que un clustering con umbrales.
 */
export function agruparDuplicados(
  registros: RegistroPadron[],
  radioM: number = RADIO_DUPLICADO_M,
): DecisionFusion[] {
  const visitados = new Set<number>();
  const decisiones: DecisionFusion[] = [];

  for (const semilla of registros) {
    if (visitados.has(semilla.id)) continue;

    const grupo: RegistroPadron[] = [semilla];
    visitados.add(semilla.id);

    // Cierre transitivo por anchura.
    for (let i = 0; i < grupo.length; i++) {
      for (const otro of registros) {
        if (visitados.has(otro.id)) continue;
        if (haversineM(grupo[i], otro) <= radioM) {
          grupo.push(otro);
          visitados.add(otro.id);
        }
      }
    }

    if (grupo.length === 1) continue;

    // Gana la fuente más fiable; a igualdad, la fila más antigua (id menor),
    // para que reejecutar la fusión no cambie de superviviente cada vez.
    const superviviente = grupo.reduce((mejor, actual) => {
      const dc = confianzaFuente(actual.fuente) - confianzaFuente(mejor.fuente);
      if (dc > 0) return actual;
      if (dc < 0) return mejor;
      return actual.id < mejor.id ? actual : mejor;
    });

    decisiones.push({
      supervivienteId: superviviente.id,
      duplicadosIds: grupo.filter((g) => g.id !== superviviente.id).map((g) => g.id),
    });
  }

  return decisiones;
}
