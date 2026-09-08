/**
 * El semáforo. Función pura, y la pieza más delicada de la app.
 *
 * Un local que parece bueno y no lo es cuesta un viaje, una señal, o peor. Un
 * local que parece malo y era bueno cuesta una oportunidad. LOS DOS ERRORES NO
 * VALEN LO MISMO, y toda esta función está escrita alrededor de esa asimetría.
 *
 * Por eso no devuelve "cumple / no cumple". La coordenada de un anuncio no es
 * fiable a la escala de 250 metros: los portales la desplazan a propósito,
 * a veces cientos de metros. Afirmar cumplimiento sobre ese dato sería
 * inventarse una precisión que la entrada no tiene.
 *
 *   verde  → cumple incluso en el PEOR caso del error de posición
 *   rojo   → incumple incluso en el MEJOR caso
 *   ámbar  → el dato de entrada no permite decidir; hay que ir a mirar
 *   sin_datos → no se ha podido calcular, y se dice por qué
 *
 * Un ámbar no es un fallo del sistema: es su respuesta correcta cuando el
 * portal no da mejor dato. Se notifica igual que un verde, y el bot existe
 * precisamente para convertirlo en verde o rojo con una dirección exacta.
 */

import type {
  Medicion,
  PrecisionCoordenadas,
  Umbrales,
  Veredicto,
} from '../types/locales';

/**
 * Margen de incertidumbre en metros que aporta una coordenada, según lo que
 * se sabe de ella.
 *
 * `exacta` es una dirección con número resuelta a portal: no aporta margen.
 * `aproximada` es lo que dan los portales inmobiliarios cuando ofuscan la
 * ubicación. `desconocida` es no saber siquiera eso.
 */
export const MARGEN_POR_PRECISION: Record<PrecisionCoordenadas, number> = {
  exacta: 0,
  aproximada: 150,
  desconocida: 300,
};

/** Una de las dos comprobaciones (farmacias o centros sanitarios). */
export interface EntradaComprobacion {
  /** Umbral legal en metros. `null` = esta comprobación no aplica. */
  umbralM: number | null;
  /**
   * Candidatas que dejó pasar el prefiltro, ya medidas.
   *
   * Vacío significa algo muy concreto y muy útil: el prefiltro no encontró
   * NINGUNA dentro del radio, luego la más cercana está más lejos que
   * `umbral * FACTOR_RODEO` y el umbral se cumple con holgura demostrada.
   */
  mediciones: Medicion[];
}

export interface EntradaVeredicto {
  precisionPunto: PrecisionCoordenadas;
  farmacias: EntradaComprobacion;
  centros: EntradaComprobacion;
  umbrales: Umbrales;
  /** `false` degrada cualquier verde a ámbar (ver `padron/cobertura.ts`). */
  coberturaSuficiente: boolean;
  coberturaMotivo?: string | null;
}

export interface SalidaVeredicto {
  veredicto: Veredicto;
  motivo: string;
  farmaciaMasCercana: Medicion | null;
  centroMasCercano: Medicion | null;
}

/** Gravedad relativa: manda siempre la peor de las dos comprobaciones. */
const GRAVEDAD: Record<Veredicto, number> = {
  verde: 0,
  ambar: 1,
  sin_datos: 2,
  rojo: 3,
};

interface ResultadoComprobacion {
  veredicto: Veredicto;
  motivo: string;
  masCercana: Medicion | null;
}

function metrosDe(m: Medicion): number | null {
  return m.metros;
}

/** Cómo se nombra cada comprobación en el motivo, con su género. */
interface Etiqueta {
  nombre: string;
  /** "Ninguna farmacia" / "Ningún centro sanitario". */
  ninguno: string;
}

const ETIQUETA_FARMACIA: Etiqueta = { nombre: 'farmacia', ninguno: 'Ninguna farmacia' };
const ETIQUETA_CENTRO: Etiqueta = {
  nombre: 'centro sanitario',
  ninguno: 'Ningún centro sanitario',
};

function comprobar(
  entrada: EntradaComprobacion,
  precisionPunto: PrecisionCoordenadas,
  etiquetas: Etiqueta,
): ResultadoComprobacion {
  const etiqueta = etiquetas.nombre;
  const { umbralM, mediciones } = entrada;

  // `null` significa "esta comunidad no impone esta distancia", NUNCA
  // "cero metros". No comprobar no puede penalizar el veredicto.
  if (umbralM === null) {
    return { veredicto: 'verde', motivo: '', masCercana: null };
  }

  // El prefiltro no encontró ninguna: la más cercana está fuera del radio de
  // búsqueda, que es varias veces el umbral. Cumple, y es demostrable.
  if (mediciones.length === 0) {
    return {
      veredicto: 'verde',
      motivo: `${etiquetas.ninguno} en el entorno del umbral de ${umbralM} m.`,
      masCercana: null,
    };
  }

  const medidas = mediciones.filter((m) => metrosDe(m) !== null);
  // Solo las decisivas cuentan como laguna: una candidata fuera del radio
  // decisivo no puede incumplir, así que no medirla no oculta nada.
  const sinMedir = mediciones.filter((m) => m.decisiva && metrosDe(m) === null).length;

  // Había candidatas pero el motor no supo rutar ninguna: no se puede decidir.
  if (medidas.length === 0) {
    return {
      veredicto: 'sin_datos',
      motivo:
        `Hay ${mediciones.length} ${etiqueta}(s) cerca, pero el motor de rutas no ` +
        `encontró camino peatonal a ninguna.`,
      masCercana: null,
    };
  }

  const masCercana = medidas.reduce((a, b) =>
    (metrosDe(a) as number) <= (metrosDe(b) as number) ? a : b,
  );
  const m = metrosDe(masCercana) as number;

  const margen =
    MARGEN_POR_PRECISION[precisionPunto] +
    MARGEN_POR_PRECISION[masCercana.establecimiento.precision];

  const nombre = masCercana.establecimiento.nombre?.trim() || `${etiqueta} sin nombre`;
  const dist = `${Math.round(m)} m`;

  let veredicto: Veredicto;
  let motivo: string;

  if (m - margen > umbralM) {
    veredicto = 'verde';
    motivo = `${etiqueta} más cercana ("${nombre}") a ${dist} caminando, umbral ${umbralM} m.`;
  } else if (m + margen < umbralM) {
    veredicto = 'rojo';
    motivo = `${etiqueta} más cercana ("${nombre}") a ${dist} caminando, por debajo del umbral de ${umbralM} m.`;
  } else {
    veredicto = 'ambar';
    motivo =
      `${etiqueta} más cercana ("${nombre}") a ${dist} caminando, umbral ${umbralM} m. ` +
      `El margen de ±${margen} m de las coordenadas no permite decidir: hay que comprobarlo sobre la dirección exacta.`;
  }

  // Una candidata sin rutar podría estar más cerca que la que hemos medido.
  // Mientras el veredicto no sea ya malo, eso impide afirmar cumplimiento.
  if (sinMedir > 0 && veredicto === 'verde') {
    veredicto = 'ambar';
    motivo += ` Quedan ${sinMedir} sin rutar, que podrían estar más cerca.`;
  }

  return { veredicto, motivo, masCercana };
}

export function calcularVeredicto(entrada: EntradaVeredicto): SalidaVeredicto {
  const farmacias = comprobar(entrada.farmacias, entrada.precisionPunto, ETIQUETA_FARMACIA);
  const centros = comprobar(entrada.centros, entrada.precisionPunto, ETIQUETA_CENTRO);

  let veredicto: Veredicto =
    GRAVEDAD[farmacias.veredicto] >= GRAVEDAD[centros.veredicto]
      ? farmacias.veredicto
      : centros.veredicto;

  const motivos = [farmacias.motivo, centros.motivo].filter((m) => m.length > 0);

  // Un padrón incompleto solo puede fallar en una dirección: farmacias que
  // existen y no están. Por eso degrada verdes, y no toca nada más.
  if (veredicto === 'verde' && !entrada.coberturaSuficiente) {
    veredicto = 'ambar';
    motivos.push(
      entrada.coberturaMotivo?.trim() ||
        'El padrón de farmacias de este municipio parece incompleto, así que no se puede afirmar que cumpla.',
    );
  }

  if (!entrada.umbrales.verificado) {
    motivos.push(
      'Aviso: la distancia legal usada no está verificada contra la norma de esta comunidad; ' +
        'se ha aplicado el mínimo estatal de la Ley 16/1997.',
    );
  }

  return {
    veredicto,
    motivo: motivos.join(' '),
    farmaciaMasCercana: farmacias.masCercana,
    centroMasCercano: centros.masCercana,
  };
}
