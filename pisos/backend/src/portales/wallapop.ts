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
 * Diferencia importante con los portales inmobiliarios: en Wallapop el
 * grueso del anuncio lo escribe un particular a mano. Cuando el anuncio SÍ
 * está publicado como inmueble, la API trae `type_attributes` con
 * `{ operation, type, surface, rooms, bathrooms }` estructurado y se usan
 * esos; si no, se cae al texto del título/descripción con `normalizar.ts`.
 * `type_attributes.type` también sirve para descartar locales, garajes y
 * terrenos, que no son lo que busca esta app.
 *
 * Wallapop devuelve pocos inmuebles en venta por esta vía (su búsqueda no
 * es un portal inmobiliario): es una fuente de apoyo, no la principal.
 *
 * Verificar con:  npm run smoke -- wallapop "Madrid" --lat 40.4168 --lng -3.7038 --radio 15
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
  /**
   * Wallapop SÍ trae datos estructurados de inmueble cuando el anuncio está
   * publicado como tal (no cuando alguien vende un piso desde la categoría
   * genérica). Se prefieren a lo que se saque del texto libre.
   */
  type_attributes?: {
    operation?: unknown;
    type?: unknown;
    surface?: unknown;
    rooms?: unknown;
    bathrooms?: unknown;
    elevator?: unknown;
    garage?: unknown;
    terrace?: unknown;
  } | null;
}

/** `type_attributes.type` que no son vivienda. */
const TIPOS_NO_VIVIENDA = ['local', 'oficina', 'garaje', 'plaza de garaje', 'terreno', 'nave', 'trastero', 'parking'];

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

  const attrs = raw.type_attributes ?? null;
  const tipoAttr = typeof attrs?.type === 'string' ? attrs.type.toLowerCase() : null;
  // Si el anuncio se identifica como local/garaje/terreno, no es lo que busca
  // esta app; se descarta aquí en vez de dejar que pase el filtro por no
  // tener m²/habitaciones.
  if (tipoAttr && TIPOS_NO_VIVIENDA.some((t) => tipoAttr.includes(t))) return null;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null;

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
    metros: num(attrs?.surface) ?? extraerMetros(texto),
    habitaciones: num(attrs?.rooms) ?? extraerHabitaciones(texto),
    banos: num(attrs?.bathrooms) ?? extraerBanos(texto),
    planta: extraerPlanta(texto),
    ascensor: (attrs?.elevator === true ? true : null) ?? tieneAscensor(texto),
    garaje: (attrs?.garage === true ? true : null) ?? tieneGaraje(texto),
    terraza: (attrs?.terrace === true ? true : null) ?? tieneTerraza(texto),
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
