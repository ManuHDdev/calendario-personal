import type { AnuncioCrudo } from '../types/pisos';
import type { CriteriosPortal, OpcionesBusqueda, PortalProvider } from './types';
import { fetchTexto } from './http';
import {
  extraerJsonLd,
  filtrarPorTipo,
  primerValor,
  comoTexto,
  comoEntero,
} from './extraer';
import {
  parsearPrecio,
  slugificar,
  extraerMetros,
  extraerHabitaciones,
  extraerBanos,
  extraerPlanta,
  tieneAscensor,
  tieneGaraje,
  tieneTerraza,
} from './normalizar';

const BASE = 'https://www.pisos.com';
const PORTAL = 'pisos';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TODO EL CONOCIMIENTO ESPECÍFICO DE pisos.com VIVE EN ESTE BLOQUE.
 *
 * Si el portal cambia su estructura de URL, se toca `construirUrl`; si
 * cambia la forma de sus datos, se toca `parsearAnuncio`. Nada más del
 * proyecto depende de estos detalles.
 *
 * Verificar con:  npm run smoke -- pisos "Badajoz"
 * ─────────────────────────────────────────────────────────────────────────
 */
function construirUrl(criterios: CriteriosPortal, pagina: number): string {
  const zona = slugificar(criterios.ubicacion);
  // pisos.com pagina por segmento de ruta, no por query: /venta/pisos-badajoz/2/
  const ruta = pagina <= 1 ? `/venta/pisos-${zona}/` : `/venta/pisos-${zona}/${pagina}/`;

  const params = new URLSearchParams();
  if (criterios.precioMin !== null) params.set('precioDesde', String(criterios.precioMin));
  if (criterios.precioMax !== null) params.set('precioHasta', String(criterios.precioMax));
  if (criterios.metrosMin !== null) params.set('superficieDesde', String(criterios.metrosMin));
  if (criterios.metrosMax !== null) params.set('superficieHasta', String(criterios.metrosMax));
  if (criterios.habitacionesMin !== null) params.set('habitacionesDesde', String(criterios.habitacionesMin));
  // Orden por más reciente: es toda la premisa de la app.
  params.set('orden', 'relevancia-desc');

  const query = params.toString();
  return `${BASE}${ruta}${query ? `?${query}` : ''}`;
}

/** El id del anuncio dentro de pisos.com, sacado de su propia URL. */
function idDesdeUrl(url: string): string | null {
  const match = url.match(/(\d{6,})/g);
  return match ? match[match.length - 1] : null;
}

function absoluta(url: string): string {
  if (url.startsWith('http')) return url;
  return `${BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

function parsearAnuncio(objeto: Record<string, unknown>): AnuncioCrudo | null {
  const urlBruta = comoTexto(primerValor(objeto, ['url', 'mainEntityOfPage', 'offers.url']));
  if (!urlBruta) return null;

  const url = absoluta(urlBruta);
  const portalId =
    comoTexto(primerValor(objeto, ['sku', 'productID', 'identifier'])) ?? idDesdeUrl(url);
  if (!portalId) return null;

  const titulo = comoTexto(primerValor(objeto, ['name', 'headline', 'description'])) ?? '(sin título)';
  const descripcion = comoTexto(objeto.description) ?? '';
  // El texto libre es el plan B para todo lo que el JSON-LD no traiga
  // estructurado; en pisos.com el título suele llevar metros y habitaciones.
  const texto = `${titulo} ${descripcion}`;

  const precio = parsearPrecio(
    comoTexto(primerValor(objeto, ['offers.price', 'price', 'offers.lowPrice'])),
  );

  const metros =
    comoEntero(primerValor(objeto, ['floorSize.value', 'floorSize', 'size'])) ??
    extraerMetros(texto);
  const habitaciones =
    comoEntero(primerValor(objeto, ['numberOfRooms.value', 'numberOfRooms', 'numberOfBedrooms'])) ??
    extraerHabitaciones(texto);
  const banos =
    comoEntero(primerValor(objeto, ['numberOfBathroomsTotal', 'numberOfBathrooms'])) ??
    extraerBanos(texto);

  const ubicacion =
    comoTexto(
      primerValor(objeto, [
        'address.addressLocality',
        'address.streetAddress',
        'address',
        'containedInPlace.name',
      ]),
    ) ?? null;

  const imagenBruta = objeto.image;
  const imagenUrl = comoTexto(Array.isArray(imagenBruta) ? imagenBruta[0] : imagenBruta);

  return {
    portal: PORTAL,
    portalId,
    url,
    titulo,
    precio,
    metros,
    habitaciones,
    banos,
    planta: extraerPlanta(texto),
    ascensor: tieneAscensor(texto),
    garaje: tieneGaraje(texto),
    terraza: tieneTerraza(texto),
    ubicacion,
    latitud: numeroONulo(primerValor(objeto, ['geo.latitude'])),
    longitud: numeroONulo(primerValor(objeto, ['geo.longitude'])),
    imagenUrl: imagenUrl ? absoluta(imagenUrl) : null,
  };
}

function numeroONulo(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'string') {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Expuesto para los tests: parsea una página ya descargada. */
export function parsearPagina(html: string): AnuncioCrudo[] {
  const objetos = extraerJsonLd(html);
  const candidatos = filtrarPorTipo(objetos, [
    'Product',
    'Residence',
    'Apartment',
    'House',
    'SingleFamilyResidence',
    'RealEstateListing',
    'Offer',
  ]);

  const anuncios: AnuncioCrudo[] = [];
  const vistos = new Set<string>();
  for (const objeto of candidatos) {
    const anuncio = parsearAnuncio(objeto);
    if (!anuncio || vistos.has(anuncio.portalId)) continue;
    vistos.add(anuncio.portalId);
    anuncios.push(anuncio);
  }
  return anuncios;
}

export const pisosComProvider: PortalProvider = {
  id: PORTAL,
  nombre: 'pisos.com',

  puedeBuscar(criterios) {
    return criterios.ubicacion.trim()
      ? { ok: true }
      : { ok: false, motivo: 'pisos.com necesita una ubicación con nombre' };
  },

  async buscar(criterios, opciones: OpcionesBusqueda = {}) {
    const maxPaginas = Math.max(1, opciones.maxPaginas ?? 2);
    const anuncios: AnuncioCrudo[] = [];
    const vistos = new Set<string>();

    for (let pagina = 1; pagina <= maxPaginas; pagina++) {
      const html = await fetchTexto(construirUrl(criterios, pagina), {
        portal: 'pisos.com',
        timeoutMs: opciones.timeoutMs,
      });
      const anunciosPagina = parsearPagina(html);
      // Una página sin resultados es el final del listado: seguir pidiendo
      // páginas vacías solo gasta peticiones contra el portal.
      if (anunciosPagina.length === 0) break;

      for (const anuncio of anunciosPagina) {
        if (vistos.has(anuncio.portalId)) continue;
        vistos.add(anuncio.portalId);
        anuncios.push(anuncio);
      }
    }

    return anuncios;
  },
};
