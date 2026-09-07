/**
 * Orquestador de la comprobación de viabilidad.
 *
 * Ata las piezas puras (`geo`, `veredicto`) con el padrón, el motor de rutas y
 * el presupuesto. Es el único punto por el que se calcula un veredicto, lo use
 * el rastreador, la API o el bot de Telegram — y por tanto el único sitio
 * donde arreglar el cálculo para arreglarlo en los tres.
 */

import {
  cajaEnvolvente,
  candidatasEnRadio,
  claveGeo,
  haversineM,
  radioDecisivoM,
  radioInformativoM,
} from './geo';
import {
  calcularVeredicto,
  MARGEN_POR_PRECISION,
  type EntradaComprobacion,
} from './veredicto';
import { getMotor, matrizTroceada, MotorError } from './motor';
import { reservar } from './presupuesto';
import {
  centrosEnCaja,
  escribirRutaCache,
  farmaciasEnCaja,
  getCobertura,
  getUmbrales,
  leerRutaCache,
  padronTieneFarmacias,
  type SobreescrituraUmbrales,
} from '../db/queries';
import type {
  Establecimiento,
  Medicion,
  PuntoConPrecision,
  ResultadoViabilidad,
  Umbrales,
} from '../types/locales';

export interface OpcionesComprobacion {
  comunidad?: string | null;
  provincia?: string | null;
  municipio?: string | null;
  sobreescritura?: SobreescrituraUmbrales;
}

function sinDatos(motivo: string, umbrales: Umbrales): ResultadoViabilidad {
  return {
    veredicto: 'sin_datos',
    motivo,
    farmaciaMasCercana: null,
    centroMasCercano: null,
    farmacias: [],
    centros: [],
    umbrales,
    motor: null,
    calculadoEn: new Date(),
  };
}

/**
 * Mide en metros caminando desde `origen` a cada establecimiento.
 *
 * Los dos conjuntos (farmacias y centros) se miden en la MISMA llamada al
 * motor: comparten origen, así que separarlos duplicaría el gasto de cuota sin
 * ganar nada. Antes de salir a la red se consulta la caché, que es permanente
 * — la red de aceras y las farmacias se mueven en años, no en minutos.
 */
async function medir(
  origen: PuntoConPrecision,
  grupos: Array<{ candidatas: Establecimiento[]; radioDecisivo: number }>,
): Promise<{ mediciones: Medicion[][]; motorUsado: string | null; incidencia: string | null }> {
  const motor = getMotor();
  const origenGeo = claveGeo(origen);

  const todos = grupos.flatMap((g) => g.candidatas);
  if (todos.length === 0) {
    return { mediciones: grupos.map(() => []), motorUsado: motor.nombre, incidencia: null };
  }

  // Deduplica por coordenada: dos fuentes pueden apuntar al mismo portal, y
  // rutar dos veces al mismo sitio gasta cuota para nada.
  const clavePorEstablecimiento = new Map<number, string>();
  const destinosUnicos = new Map<string, { lat: number; lng: number }>();
  for (const e of todos) {
    const clave = claveGeo(e);
    clavePorEstablecimiento.set(e.id, clave);
    if (!destinosUnicos.has(clave)) destinosUnicos.set(clave, { lat: e.lat, lng: e.lng });
  }

  const claves = [...destinosUnicos.keys()];
  const metrosPorClave = await leerRutaCache(motor.nombre, origenGeo, claves);
  const pendientes = claves.filter((c) => !metrosPorClave.has(c));

  let incidencia: string | null = null;

  if (pendientes.length > 0) {
    const peticiones = Math.ceil(pendientes.length / motor.maxDestinos);
    const hayPresupuesto = await reservar(motor.nombre, peticiones);

    if (!hayPresupuesto) {
      incidencia =
        'Presupuesto diario de peticiones al motor de rutas agotado: la medición se reintentará automáticamente.';
    } else {
      try {
        const metros = await matrizTroceada(
          motor,
          { lat: origen.lat, lng: origen.lng },
          pendientes.map((c) => destinosUnicos.get(c) as { lat: number; lng: number }),
        );
        const nuevas: Array<{ destinoGeo: string; metros: number | null }> = [];
        pendientes.forEach((clave, i) => {
          const m = metros[i] ?? null;
          metrosPorClave.set(clave, m);
          nuevas.push({ destinoGeo: clave, metros: m });
        });
        await escribirRutaCache(motor.nombre, origenGeo, nuevas).catch(() => undefined);
      } catch (err) {
        // Un fallo del motor degrada la medición, no tumba la comprobación:
        // lo que se haya sacado de caché sigue valiendo, y lo que falte
        // aparecerá como "sin rutar" en el veredicto.
        incidencia =
          err instanceof MotorError
            ? `El motor de rutas falló: ${err.message}`
            : `El motor de rutas falló: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  const mediciones = grupos.map((grupo) =>
    grupo.candidatas.map((establecimiento) => {
      const clave = clavePorEstablecimiento.get(establecimiento.id) as string;
      const m = metrosPorClave.has(clave) ? (metrosPorClave.get(clave) as number | null) : null;
      return {
        establecimiento,
        metros: m,
        decisiva: haversineM(origen, establecimiento) <= grupo.radioDecisivo,
      };
    }),
  );

  return { mediciones, motorUsado: motor.nombre, incidencia };
}

/**
 * Calcula el veredicto para un punto.
 *
 * No lanza por fallos previsibles (padrón vacío, sin normativa, motor caído):
 * devuelve `sin_datos` con el motivo. Un anuncio nunca debe perderse porque el
 * cálculo no se pudiera hacer.
 */
export async function comprobarPunto(
  punto: PuntoConPrecision,
  opciones: OpcionesComprobacion = {},
): Promise<ResultadoViabilidad> {
  const over = opciones.sobreescritura ?? {};
  const umbrales = await getUmbrales(opciones.comunidad ?? null, over);

  // Un umbral nulo porque el usuario apagó la comprobación es legítimo. Un
  // umbral nulo porque no hay normativa cargada NO lo es: dar verde ahí sería
  // afirmar cumplimiento contra una ley que no hemos leído.
  const faltaNormativaFarmacias =
    umbrales.distanciaFarmaciasM === null && over.comprobarFarmacias !== false;
  if (faltaNormativaFarmacias) {
    return sinDatos(
      umbrales.notas ??
        'No hay normativa de distancias cargada para esta comunidad, así que no se ha calculado nada.',
      umbrales,
    );
  }

  if (umbrales.distanciaFarmaciasM !== null && !(await padronTieneFarmacias(opciones.comunidad ?? null))) {
    return sinDatos(
      `No hay ninguna farmacia en el padrón para ${opciones.comunidad ?? 'esta zona'}. ` +
        'Importa el padrón antes de fiarte de ningún veredicto.',
      umbrales,
    );
  }

  /**
   * El margen que hay que asumir al prefiltrar.
   *
   * Se suma el peor caso del establecimiento (`desconocida`) porque su
   * precisión no se conoce hasta haberlo traído de la base de datos, y
   * prefiltrar con un margen optimista dejaría fuera justo lo que podría
   * incumplir.
   */
  const margenPrefiltro =
    MARGEN_POR_PRECISION[punto.precision] + MARGEN_POR_PRECISION.desconocida;

  const buscar = async (
    umbralM: number | null,
    enCaja: (c: ReturnType<typeof cajaEnvolvente>) => Promise<Establecimiento[]>,
  ): Promise<{ candidatas: Establecimiento[]; radioDecisivo: number }> => {
    if (umbralM === null) return { candidatas: [], radioDecisivo: 0 };
    const radioDecisivo = radioDecisivoM(umbralM, margenPrefiltro);
    const radioInformativo = radioInformativoM(umbralM, margenPrefiltro);
    const enBruto = await enCaja(cajaEnvolvente(punto, radioInformativo));
    return {
      candidatas: candidatasEnRadio(punto, enBruto, radioInformativo),
      radioDecisivo,
    };
  };

  const [farmaciasPrefiltro, centrosPrefiltro] = await Promise.all([
    buscar(umbrales.distanciaFarmaciasM, farmaciasEnCaja),
    buscar(umbrales.distanciaCentrosSanitariosM, centrosEnCaja),
  ]);
  const { mediciones, motorUsado, incidencia } = await medir(punto, [
    farmaciasPrefiltro,
    centrosPrefiltro,
  ]);
  const [medFarmacias, medCentros] = mediciones;

  const cobertura = await getCobertura(opciones.municipio ?? null, opciones.provincia ?? null);

  const entradaFarmacias: EntradaComprobacion = {
    umbralM: umbrales.distanciaFarmaciasM,
    mediciones: medFarmacias,
  };
  const entradaCentros: EntradaComprobacion = {
    umbralM: umbrales.distanciaCentrosSanitariosM,
    mediciones: medCentros,
  };

  const salida = calcularVeredicto({
    precisionPunto: punto.precision,
    farmacias: entradaFarmacias,
    centros: entradaCentros,
    umbrales,
    coberturaSuficiente: cobertura.suficiente,
    coberturaMotivo: cobertura.motivo,
  });

  const ordenar = (m: Medicion[]) =>
    [...m].sort((a, b) => (a.metros ?? Infinity) - (b.metros ?? Infinity));

  return {
    veredicto: salida.veredicto,
    motivo: incidencia ? `${salida.motivo} ${incidencia}` : salida.motivo,
    farmaciaMasCercana: salida.farmaciaMasCercana,
    centroMasCercano: salida.centroMasCercano,
    farmacias: ordenar(medFarmacias),
    centros: ordenar(medCentros),
    umbrales,
    motor: (motorUsado as ResultadoViabilidad['motor']) ?? null,
    calculadoEn: new Date(),
  };
}

/** Texto que acompaña SIEMPRE a un veredicto, en la UI y en el bot. */
export const AVISO_NO_CERTIFICA =
  'Este cálculo es una ayuda para descartar y priorizar, no una medición oficial: ' +
  'el método exacto lo fija el reglamento de cada comunidad. Confírmalo con un técnico antes de decidir.';
