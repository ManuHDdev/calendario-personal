/**
 * Rentabilidad de alquiler por zona: para una ubicación dada, busca anuncios
 * EN VENTA (Fotocasa + pisos.com) y estima cuánto se podría alquilar cada uno
 * a partir del precio/m² de alquiler real de esa misma zona (Fotocasa +
 * pisos.com, pero en su sección de alquiler).
 *
 * Deliberadamente NO calcula rentabilidad aquí (cash-on-cash, cuota de
 * hipoteca, etc.) — eso se queda en el frontend
 * (`calcularAlquilerRentabilidad` de `lib/calculators.ts`) para que el
 * usuario pueda tocar entrada/TIN/gastos y ver el ranking recalcularse al
 * instante, sin una petición nueva por cada cambio. Esta ruta solo hace una
 * cosa: reunir "anuncios en venta" + "una estimación de alquiler por m²
 * fiable para esta zona" en un único payload.
 *
 * Síncrono, sin persistencia: cada llamada rastrea los portales en el
 * momento (mismo principio que un rastreo bajo demanda de `pisos`, pero sin
 * guardar nada — no hay tabla, no hay `busqueda_id`, no hay programación).
 */

import { fotocasaProvider } from '../portales/fotocasa';
import { pisosComProvider } from '../portales/pisoscom';
import { mediana } from './mediana';
import type { AnuncioCrudo, CriteriosPortal, PortalProvider, TipoOperacion } from '../portales/types';

const PROVIDERS: PortalProvider[] = [fotocasaProvider, pisosComProvider];

/** Páginas por portal y operación — mismo presupuesto para venta que para alquiler. */
const MAX_PAGINAS_POR_PORTAL = 2;

/**
 * Por debajo de este número de comparables de alquiler, la estimación se
 * marca `confianza: 'baja'` — una mediana de 2-3 anuncios es mucho más
 * ruidosa que una de 20+, aunque la mediana en sí ya amortigua atípicos.
 */
const MIN_COMPARABLES_ALTA_CONFIANZA = 5;

export interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

/**
 * Modo de estimación del alquiler: `'alquiler_completo'` (por defecto, todo
 * el piso, comparables de la sección `alquiler`) o `'habitaciones'`
 * (ingreso por habitaciones sueltas, comparables de la sección `compartir`
 * multiplicados por el número de habitaciones del anuncio en venta).
 */
export const MODOS_RENTABILIDAD_ZONA = ['alquiler_completo', 'habitaciones', 'flip'] as const;
export type ModoRentabilidadZona = (typeof MODOS_RENTABILIDAD_ZONA)[number];

export interface ListingRentabilidadZona {
  titulo: string;
  url: string;
  portal: string;
  precio: number;
  metros: number;
  habitaciones: number | null;
  ubicacion: string | null;
  imagenUrl: string | null;
  /** Nullable: el portal no siempre publica coordenadas del anuncio. */
  latitud: number | null;
  longitud: number | null;
  /** null cuando no hay mediana de alquiler para la zona — nunca un número inventado. */
  alquilerMensualEstimado: number | null;
  /** Comparables de alquiler que alimentan la mediana de TODA la zona (no por anuncio). */
  numComparablesAlquiler: number;
  confianza: 'alta' | 'baja';
  /**
   * Desviación del €/m² de este anuncio respecto a `medianaVentaM2` de la
   * zona: ((precio/metros - medianaVentaM2) / medianaVentaM2) * 100.
   * Negativo = por debajo de la mediana (posible chollo); positivo = por
   * encima (posible sobreprecio). `null` cuando `medianaVentaM2` es `null`
   * (sin comparables de venta suficientes) — nunca un 0% inventado.
   */
  desviacionVsMedianaVentaPct: number | null;
}

export interface RentabilidadZonaResultado {
  ubicacion: string;
  /** Eco del modo solicitado — `'alquiler_completo'` cuando no se pidió ninguno. */
  modo: ModoRentabilidadZona;
  listings: ListingRentabilidadZona[];
  numComparablesAlquilerTotal: number;
  medianaAlquilerM2: number | null;
  /**
   * Mediana de €/m² de los anuncios EN VENTA de la zona (no confundir con
   * `medianaAlquilerM2`, que viene de los comparables de alquiler): la
   * valoración automática (AVM) de referencia contra la que se compara el
   * precio/m² de cada listing individual (`desviacionVsMedianaVentaPct`).
   */
  medianaVentaM2: number | null;
  /** Comparables de venta (con precio y metros) que alimentan `medianaVentaM2`. */
  numComparablesVentaTotal: number;
  avisos: string[];
}

function criterios(ubicacion: string, operacion: TipoOperacion): CriteriosPortal {
  return {
    tipo: 'vivienda',
    operacion,
    ubicacion,
    latitud: null,
    longitud: null,
    radioKm: null,
    precioMin: null,
    precioMax: null,
    metrosMin: null,
    metrosMax: null,
    habitacionesMin: null,
    banosMin: null,
  };
}

/**
 * Busca en todos los portales para una operación dada. Un portal que falla
 * (bloqueo, red, `puedeBuscar` en falso) se loguea y se omite — nunca aborta
 * el resto, mismo principio transversal que `capitalScraper.ts`/`pisos`: un
 * fallo parcial no debe tumbar la búsqueda entera.
 */
async function buscarEnPortales(
  ubicacion: string,
  operacion: TipoOperacion,
  log?: Logger,
): Promise<AnuncioCrudo[]> {
  const resultados: AnuncioCrudo[] = [];

  for (const provider of PROVIDERS) {
    const crit = criterios(ubicacion, operacion);
    const puede = provider.puedeBuscar(crit);
    if (!puede.ok) {
      log?.warn(`[rentabilidadZona] ${provider.id}/${operacion}: omitido (${puede.motivo})`);
      continue;
    }

    try {
      const anuncios = await provider.buscar(crit, { maxPaginas: MAX_PAGINAS_POR_PORTAL });
      resultados.push(...anuncios);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      log?.warn(`[rentabilidadZona] ${provider.id}/${operacion}: fallo (${mensaje})`);
    }
  }

  return resultados;
}

/** Precio/m²/mes de cada comparable de alquiler que tiene AMBOS datos (precio y metros). */
function preciosPorM2Alquiler(anunciosAlquiler: AnuncioCrudo[]): number[] {
  return anunciosAlquiler
    .filter((a) => a.precio !== null && a.precio > 0 && a.metros !== null && a.metros > 0)
    .map((a) => (a.precio as number) / (a.metros as number));
}

/**
 * Precio mensual de cada comparable de "compartir" (alquiler por
 * habitaciones) que tiene precio. A diferencia de `preciosPorM2Alquiler`,
 * NUNCA se divide por `metros`: en un anuncio "compartir" la superficie
 * publicada es la del PISO ENTERO, no la de la habitación alquilada (ver el
 * comentario de cabecera de `portales/fotocasa.ts`), así que un precio/m²
 * ahí sería una magnitud sin sentido. Solo se necesita el precio en bruto.
 */
function preciosHabitacion(anunciosCompartir: AnuncioCrudo[]): number[] {
  return anunciosCompartir
    .filter((a) => a.precio !== null && a.precio > 0)
    .map((a) => a.precio as number);
}

/** Precio/m² de cada anuncio EN VENTA que tiene AMBOS datos (precio y metros). */
function preciosPorM2Venta(anunciosVenta: AnuncioCrudo[]): number[] {
  return anunciosVenta
    .filter((a) => a.precio !== null && a.precio > 0 && a.metros !== null && a.metros > 0)
    .map((a) => (a.precio as number) / (a.metros as number));
}

export async function calcularRentabilidadZona(
  ubicacion: string,
  log?: Logger,
  modo: ModoRentabilidadZona = 'alquiler_completo',
): Promise<RentabilidadZonaResultado> {
  const avisos: string[] = [];
  const esHabitaciones = modo === 'habitaciones';
  const esFlip = modo === 'flip';

  // Modo 'flip' (comprar, reformar, vender) no necesita NINGÚN comparable de
  // alquiler ni de "compartir": la rentabilidad de un flip sale de comparar
  // precio de compra con precio de VENTA estimado (medianaVentaM2 * metros),
  // que ya se calcula más abajo a partir de los propios anuncios en venta —
  // dato que el servicio ya trae para TODOS los modos. Por eso aquí se evita
  // la petición de alquiler/compartir por completo (petición más ligera, no
  // solo "igual de pesada pero ignorando el resultado").
  const [enVenta, comparablesOperacion] = await Promise.all([
    buscarEnPortales(ubicacion, 'venta', log),
    esFlip ? Promise.resolve([]) : buscarEnPortales(ubicacion, esHabitaciones ? 'compartir' : 'alquiler', log),
  ]);

  // En modo habitaciones la mediana es de PRECIO (€/mes de una habitación),
  // no de €/m² — ver `preciosHabitacion`. En modo piso completo sigue siendo
  // €/m²/mes, comportamiento sin cambios. En modo flip no hay comparables de
  // alquiler en absoluto: `medianaAlquilerM2` es `null` (mismo sentinela "sin
  // estimación" que ya usan los otros modos cuando no hay datos, nunca un
  // número inventado), `numComparablesAlquilerTotal` es 0 y `confianza` se
  // fija a `'baja'` — no porque la estimación de alquiler sea de baja
  // confianza (no existe tal estimación en este modo), sino porque el tipo
  // `confianza: 'alta' | 'baja'` de cada listing no admite un tercer valor
  // "no aplica" sin tocar el contrato que ya usan los otros dos modos; 'baja'
  // es la opción que nunca sobreestima la fiabilidad de un dato ausente.
  const comparablesAlquiler = esFlip
    ? []
    : esHabitaciones
      ? preciosHabitacion(comparablesOperacion)
      : preciosPorM2Alquiler(comparablesOperacion);
  const medianaAlquilerM2 = esFlip ? null : mediana(comparablesAlquiler);
  const numComparablesAlquilerTotal = comparablesAlquiler.length;
  const confianza: 'alta' | 'baja' =
    numComparablesAlquilerTotal >= MIN_COMPARABLES_ALTA_CONFIANZA ? 'alta' : 'baja';

  if (!esFlip && numComparablesAlquilerTotal === 0) {
    avisos.push(
      esHabitaciones
        ? 'Sin anuncios de alquiler por habitaciones en esta zona: no se puede estimar el ingreso.'
        : 'Sin comparables de alquiler suficientes en esta zona: no se puede estimar el alquiler.',
    );
  } else if (!esFlip && confianza === 'baja') {
    avisos.push(
      esHabitaciones
        ? `Solo ${numComparablesAlquilerTotal} comparable(s) de alquiler por habitaciones en esta zona: estimación de baja confianza.`
        : `Solo ${numComparablesAlquilerTotal} comparable(s) de alquiler en esta zona: estimación de baja confianza.`,
    );
  }

  if (enVenta.length === 0) {
    avisos.push('No se encontraron anuncios en venta en esta zona.');
  }

  const comparablesVenta = preciosPorM2Venta(enVenta);
  const medianaVentaM2 = mediana(comparablesVenta);
  const numComparablesVentaTotal = comparablesVenta.length;

  if (medianaVentaM2 === null) {
    avisos.push(
      esFlip
        ? 'Sin comparables de venta suficientes en esta zona: no se puede estimar el precio de venta para el flip.'
        : 'Sin comparables de venta suficientes en esta zona: no se puede valorar si el precio está por encima o por debajo del mercado.',
    );
  }

  // Un anuncio en venta sin precio o sin metros no se puede rankear ni
  // estimar: se excluye del todo, igual que en calcularPrecioMedioM2 y en
  // el filtro fino de `pisos` para cualquier dato que falte por completo.
  // En modo habitaciones, además, hace falta un número de habitaciones
  // conocido (> 0): sin él no se puede multiplicar por el precio de la
  // habitación y el anuncio se excluye, mismo principio de "un dato
  // desconocido no se sustituye por una suposición". En modo flip no hace
  // falta ningún filtro adicional: la estimación de venta usa precio/metros,
  // ya exigidos arriba para todos los modos.
  const listings: ListingRentabilidadZona[] = enVenta
    .filter((a) => a.precio !== null && a.precio > 0 && a.metros !== null && a.metros > 0)
    .filter((a) => !esHabitaciones || (a.habitaciones !== null && a.habitaciones > 0))
    .map((a) => {
      const precio = a.precio as number;
      const metros = a.metros as number;
      const alquilerMensualEstimado =
        medianaAlquilerM2 === null
          ? null
          : esHabitaciones
            ? Math.round(medianaAlquilerM2 * (a.habitaciones as number) * 100) / 100
            : Math.round(medianaAlquilerM2 * metros * 100) / 100;
      const desviacionVsMedianaVentaPct =
        medianaVentaM2 !== null
          ? Math.round(((precio / metros - medianaVentaM2) / medianaVentaM2) * 100 * 100) / 100
          : null;

      return {
        titulo: a.titulo,
        url: a.url,
        portal: a.portal,
        precio,
        metros,
        habitaciones: a.habitaciones,
        ubicacion: a.ubicacion,
        imagenUrl: a.imagenUrl,
        latitud: a.latitud,
        longitud: a.longitud,
        alquilerMensualEstimado,
        numComparablesAlquiler: numComparablesAlquilerTotal,
        confianza,
        desviacionVsMedianaVentaPct,
      };
    });

  return {
    ubicacion,
    modo,
    listings,
    numComparablesAlquilerTotal,
    medianaAlquilerM2,
    medianaVentaM2,
    numComparablesVentaTotal,
    avisos,
  };
}
