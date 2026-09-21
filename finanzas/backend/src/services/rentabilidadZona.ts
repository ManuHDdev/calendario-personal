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
}

export interface RentabilidadZonaResultado {
  ubicacion: string;
  listings: ListingRentabilidadZona[];
  numComparablesAlquilerTotal: number;
  medianaAlquilerM2: number | null;
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

export async function calcularRentabilidadZona(
  ubicacion: string,
  log?: Logger,
): Promise<RentabilidadZonaResultado> {
  const avisos: string[] = [];

  const [enVenta, enAlquiler] = await Promise.all([
    buscarEnPortales(ubicacion, 'venta', log),
    buscarEnPortales(ubicacion, 'alquiler', log),
  ]);

  const comparablesAlquiler = preciosPorM2Alquiler(enAlquiler);
  const medianaAlquilerM2 = mediana(comparablesAlquiler);
  const numComparablesAlquilerTotal = comparablesAlquiler.length;
  const confianza: 'alta' | 'baja' =
    numComparablesAlquilerTotal >= MIN_COMPARABLES_ALTA_CONFIANZA ? 'alta' : 'baja';

  if (numComparablesAlquilerTotal === 0) {
    avisos.push('Sin comparables de alquiler suficientes en esta zona: no se puede estimar el alquiler.');
  } else if (confianza === 'baja') {
    avisos.push(
      `Solo ${numComparablesAlquilerTotal} comparable(s) de alquiler en esta zona: estimación de baja confianza.`,
    );
  }

  if (enVenta.length === 0) {
    avisos.push('No se encontraron anuncios en venta en esta zona.');
  }

  // Un anuncio en venta sin precio o sin metros no se puede rankear ni
  // estimar: se excluye del todo, igual que en calcularPrecioMedioM2 y en
  // el filtro fino de `pisos` para cualquier dato que falte por completo.
  const listings: ListingRentabilidadZona[] = enVenta
    .filter((a) => a.precio !== null && a.precio > 0 && a.metros !== null && a.metros > 0)
    .map((a) => {
      const precio = a.precio as number;
      const metros = a.metros as number;
      const alquilerMensualEstimado =
        medianaAlquilerM2 !== null ? Math.round(medianaAlquilerM2 * metros * 100) / 100 : null;

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
      };
    });

  return {
    ubicacion,
    listings,
    numComparablesAlquilerTotal,
    medianaAlquilerM2,
    avisos,
  };
}
