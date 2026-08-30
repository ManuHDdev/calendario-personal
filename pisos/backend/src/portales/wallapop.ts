import type { AnuncioCrudo } from '../types/pisos';
import type { CriteriosPortal, OpcionesBusqueda, PortalProvider } from './types';
import { fetchJson } from './http';
import {
  extraerMetros,
  extraerHabitaciones,
  extraerBanos,
  extraerPlanta,
  tieneAscensor,
  tieneGaraje,
  tieneTerraza,
} from './normalizar';

const SEARCH_URL = 'https://api.wallapop.com/api/v3/search';
const PORTAL = 'wallapop';

/** Wallapop devuelve 40 ítems por página; pedir más no está soportado. */
const TAMANO_PAGINA = 40;

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TODO EL CONOCIMIENTO ESPECÍFICO DE Wallapop VIVE EN ESTE BLOQUE.
 *
 * Es el mismo endpoint interno que ya usa `ruta/backend/src/services/
 * wallapop.ts` (y el proyecto marketplace-watcher): NO es la API de partner
 * de pago, y puede cambiar sin aviso.
 *
 * Diferencia importante con los portales inmobiliarios: Wallapop no expone
 * metros ni habitaciones como campos estructurados en la búsqueda, porque
 * los anuncios los escribe un particular a mano. Por eso aquí se pide poco
 * al servidor (palabra clave, zona y precio, que sí soporta) y todo lo demás
 * se saca del título/descripción con `normalizar.ts`. Es también la razón de
 * que el filtro fino se aplique después, igual para los tres portales.
 *
 * Verificar con:  npm run smoke -- wallapop "Badajoz"
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Categoría "Inmobiliaria" de Wallapop. Se deja sobrescribible por entorno
 * porque es el dato con más papeletas de cambiar y no merece un redespliegue
 * de imagen para corregirlo.
 */
const CATEGORIA_INMOBILIARIA = process.env.WALLAPOP_CATEGORIA_INMUEBLES || '200';

/** Palabras con las que buscar vivienda en venta cuando el usuario no da otras. */
const PALABRAS_POR_DEFECTO = 'piso en venta';

interface ItemCrudo {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  web_slug?: unknown;
  price?: { amount?: unknown; currency?: unknown } | null;
  location?: {
    latitude?: unknown;
    longitude?: unknown;
    city?: unknown;
    region?: unknown;
    region2?: unknown;
  } | null;
  images?: Array<{ urls?: { small?: unknown; medium?: unknown } | null }> | null;
}

function construirQuery(criterios: CriteriosPortal): URLSearchParams {
  const query = new URLSearchParams({
    source: 'quick_filters',
    keywords: PALABRAS_POR_DEFECTO,
    category_ids: CATEGORIA_INMOBILIARIA,
    latitude: String(criterios.latitud),
    longitude: String(criterios.longitud),
    distance_in_km: String(criterios.radioKm),
    order_by: 'newest',
  });
  if (criterios.precioMin !== null) query.set('min_sale_price', String(criterios.precioMin));
  if (criterios.precioMax !== null) query.set('max_sale_price', String(criterios.precioMax));
  return query;
}

function extraerItems(payload: unknown): ItemCrudo[] {
  const items = (payload as { data?: { section?: { payload?: { items?: unknown } } } })?.data
    ?.section?.payload?.items;
  if (!Array.isArray(items)) {
    throw new Error(
      'Respuesta de Wallapop con forma inesperada; es probable que hayan cambiado su API interna',
    );
  }
  return items as ItemCrudo[];
}

function extraerSiguientePagina(payload: unknown): string | null {
  const token = (payload as { meta?: { next_page?: unknown } })?.meta?.next_page;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

export function parsearItem(raw: ItemCrudo): AnuncioCrudo | null {
  const id = raw.id;
  const slug = raw.web_slug;
  if ((typeof id !== 'string' && typeof id !== 'number') || typeof slug !== 'string' || !slug) {
    return null;
  }

  const titulo = typeof raw.title === 'string' && raw.title ? raw.title : '(sin título)';
  const descripcion = typeof raw.description === 'string' ? raw.description : '';
  const texto = `${titulo} ${descripcion}`;

  const amount = raw.price?.amount;
  const ciudad = typeof raw.location?.city === 'string' ? raw.location.city : null;
  const region =
    typeof raw.location?.region2 === 'string'
      ? raw.location.region2
      : typeof raw.location?.region === 'string'
        ? raw.location.region
        : null;

  const primeraImagen = Array.isArray(raw.images) ? raw.images[0] : null;
  const imagenUrl =
    typeof primeraImagen?.urls?.medium === 'string'
      ? primeraImagen.urls.medium
      : typeof primeraImagen?.urls?.small === 'string'
        ? primeraImagen.urls.small
        : null;

  const lat = raw.location?.latitude;
  const lng = raw.location?.longitude;

  return {
    portal: PORTAL,
    portalId: String(id),
    url: `https://es.wallapop.com/item/${slug}`,
    titulo,
    precio: typeof amount === 'number' ? amount : null,
    metros: extraerMetros(texto),
    habitaciones: extraerHabitaciones(texto),
    banos: extraerBanos(texto),
    planta: extraerPlanta(texto),
    ascensor: tieneAscensor(texto),
    garaje: tieneGaraje(texto),
    terraza: tieneTerraza(texto),
    ubicacion: [ciudad, region].filter(Boolean).join(', ') || null,
    latitud: typeof lat === 'number' ? lat : null,
    longitud: typeof lng === 'number' ? lng : null,
    imagenUrl,
  };
}

export const wallapopProvider: PortalProvider = {
  id: PORTAL,
  nombre: 'Wallapop',

  puedeBuscar(criterios) {
    if (criterios.latitud === null || criterios.longitud === null || criterios.radioKm === null) {
      return {
        ok: false,
        motivo: 'Wallapop busca por radio: hace falta indicar coordenadas y radio en la búsqueda',
      };
    }
    return { ok: true };
  },

  async buscar(criterios, opciones: OpcionesBusqueda = {}) {
    const maxPaginas = Math.max(1, opciones.maxPaginas ?? 2);
    const anuncios: AnuncioCrudo[] = [];
    const vistos = new Set<string>();
    let siguientePagina: string | null = null;

    for (let pagina = 0; pagina < maxPaginas; pagina++) {
      // A partir de la segunda página Wallapop espera SOLO el token opaco:
      // ya lleva dentro la consulta original y el desplazamiento.
      const url =
        pagina === 0
          ? `${SEARCH_URL}?${construirQuery(criterios).toString()}`
          : `${SEARCH_URL}?next_page=${encodeURIComponent(siguientePagina as string)}`;

      const payload = await fetchJson(url, {
        portal: 'Wallapop',
        timeoutMs: opciones.timeoutMs,
        headers: { 'X-DeviceOS': '0' },
      });

      const items = extraerItems(payload);
      for (const raw of items) {
        const anuncio = parsearItem(raw);
        if (!anuncio || vistos.has(anuncio.portalId)) continue;
        vistos.add(anuncio.portalId);
        anuncios.push(anuncio);
      }

      siguientePagina = extraerSiguientePagina(payload);
      // Ni token ni página completa: ya no queda nada por recorrer.
      if (!siguientePagina || items.length < TAMANO_PAGINA) break;
    }

    return anuncios;
  },
};
