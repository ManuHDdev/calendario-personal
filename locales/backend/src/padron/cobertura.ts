/**
 * ¿Está el padrón completo en este municipio?
 *
 * Esta es la defensa contra el único fallo que esta app no se puede permitir:
 * una farmacia que existe, no está en el padrón, y hace que un local aparezca
 * como verde cuando en realidad incumple.
 *
 * No hay forma de saber que falta una farmacia concreta. Sí la hay de saber
 * que el conjunto no cuadra: España autoriza aproximadamente una farmacia por
 * cada 2.800 habitantes, así que un municipio de 50.000 habitantes con 4
 * farmacias en el padrón está mal cubierto, sin necesidad de saber cuáles
 * faltan. En esos municipios NINGÚN verde es de fiar, y se degradan a ámbar.
 */

/** Módulo poblacional de referencia en España (habitantes por farmacia). */
export const HABITANTES_POR_FARMACIA = 2800;

/**
 * Fracción del esperado por debajo de la cual el padrón se declara incompleto.
 *
 * No se exige el 100%: el módulo es una media nacional y hay municipios
 * legítimamente por debajo. Exigir el pleno marcaría media España como
 * incompleta y convertiría el ámbar en ruido. Por debajo del 70% ya no es
 * dispersión estadística, es que falta dato.
 */
export const UMBRAL_COBERTURA = 0.7;

export interface EntradaCobertura {
  municipio: string;
  provincia: string | null;
  farmaciasConocidas: number;
  /** `null` cuando no se conoce la población del municipio. */
  poblacion: number | null;
}

export interface SalidaCobertura extends EntradaCobertura {
  farmaciasEsperadas: number | null;
  suficiente: boolean;
  motivo: string | null;
}

export function evaluarCobertura(e: EntradaCobertura): SalidaCobertura {
  // Sin población no hay cota de cordura contra la que comparar. No se puede
  // afirmar que el padrón esté completo, así que no se afirma: `false` es la
  // dirección segura del error.
  if (e.poblacion === null || e.poblacion <= 0) {
    return {
      ...e,
      farmaciasEsperadas: null,
      suficiente: false,
      motivo:
        `No se conoce la población de ${e.municipio}, así que no se puede comprobar si el ` +
        `padrón de farmacias está completo (${e.farmaciasConocidas} conocidas).`,
    };
  }

  const esperadas = Math.max(1, Math.round(e.poblacion / HABITANTES_POR_FARMACIA));
  const suficiente = e.farmaciasConocidas >= esperadas * UMBRAL_COBERTURA;

  return {
    ...e,
    farmaciasEsperadas: esperadas,
    suficiente,
    motivo: suficiente
      ? null
      : `Padrón incompleto en ${e.municipio}: ${e.farmaciasConocidas} farmacias conocidas, ` +
        `~${esperadas} esperadas para ${e.poblacion.toLocaleString('es-ES')} habitantes.`,
  };
}
