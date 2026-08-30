import type { AnuncioCrudo } from '../types/pisos';
import type { CriteriosPortal, OpcionesBusqueda, PortalProvider } from './types';
import { fetchTexto } from './http';
import {
  extraerJsonLd,
  filtrarPorTipo,
  extraerEstadoEmbebido,
  buscarNodos,
  primerValor,
  comoTexto,
  comoEntero,
  comoBooleano,
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

const BASE = 'https://www.fotocasa.es';
const PORTAL = 'fotocasa';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TODO EL CONOCIMIENTO ESPECÍFICO DE Fotocasa VIVE EN ESTE BLOQUE.
 *
 * Fotocasa renderiza en servidor y deja el listado en el estado embebido de
 * su SPA. En vez de fijar la RUTA exacta dentro de ese estado (que cambia
 * con cada despliegue de su front), se buscan nodos por su FORMA: un anuncio
 * es un objeto con id, precio y superficie o habitaciones. Eso sobrevive a
 * un renombrado de la ruta, que es el modo de fallo habitual.
 *
 * Verificar con:  npm run smoke -- fotocasa "Badajoz"
 * ─────────────────────────────────────────────────────────────────────────
 */
function construirUrl(criterios: CriteriosPortal, pagina: number): string {
  const zona = slugificar(criterios.ubicacion);
  const ruta = `/es/comprar/viviendas/${zona}/todas-las-zonas/l/${pagina > 1 ? pagina : ''}`;

  const params = new URLSearchParams();
  if (criterios.precioMin !== null) params.set('minPrice', String(criterios.precioMin));
  if (criterios.precioMax !== null) params.set('maxPrice', String(criterios.precioMax));
  if (criterios.metrosMin !== null) params.set('minSurface', String(criterios.metrosMin));
  if (criterios.metrosMax !== null) params.set('maxSurface', String(criterios.metrosMax));
  if (criterios.habitacionesMin !== null) params.set('minRooms', String(criterios.habitacionesMin));
  // "Lo más reciente primero": sin esto el portal ordena por relevancia y un
  // piso recién publicado puede caer en la página 7.
  params.set('sortType', 'publicationDate');

  return `${BASE}${ruta.replace(/\/$/, '')}?${params.toString()}`;
}

/** ¿Este nodo del estado embebido tiene pinta de ser un anuncio? */
function pareceAnuncio(nodo: Record<string, unknown>): boolean {
  const tieneId = nodo.id !== undefined || nodo.realEstateId !== undefined;
  const tienePrecio =
    nodo.price !== undefined || nodo.rawPrice !== undefined || nodo.priceValue !== undefined;
  const tieneVivienda =
    nodo.surface !== undefined ||
    nodo.rooms !== undefined ||
    nodo.features !== undefined ||
    nodo.buildingSubtype !== undefined;
  return Boolean(tieneId && tienePrecio && tieneVivienda);
}

/**
 * Fotocasa mete metros/habitaciones/baños en una lista `features` con forma
 * `[{ key: 'surface', value: [90] }, ...]` en lugar de en campos planos.
 */
function leerFeature(nodo: Record<string, unknown>, clave: string): number | null {
  const features = nodo.features;
  if (!Array.isArray(features)) return null;

  for (const feature of features) {
    if (feature === null || typeof feature !== 'object') continue;
    const f = feature as Record<string, unknown>;
    const key = comoTexto(f.key ?? f.type ?? f.name);
    if (!key || key.toLowerCase() !== clave.toLowerCase()) continue;
    const valor = Array.isArray(f.value) ? f.value[0] : f.value;
    return comoEntero(valor);
  }
  return null;
}

function absoluta(url: string): string {
  if (url.startsWith('http')) return url;
  return `${BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

function numeroONulo(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'string') {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parsearNodo(nodo: Record<string, unknown>): AnuncioCrudo | null {
  const portalId = comoTexto(primerValor(nodo, ['id', 'realEstateId', 'adId']));
  if (!portalId) return null;

  const urlBruta = comoTexto(primerValor(nodo, ['detailUrl', 'url', 'link', 'slug']));
  if (!urlBruta) return null;

  const titulo =
    comoTexto(primerValor(nodo, ['title', 'description', 'buildingSubtype', 'subtitle'])) ??
    '(sin título)';
  const descripcion = comoTexto(primerValor(nodo, ['description', 'comment'])) ?? '';
  const texto = `${titulo} ${descripcion}`;

  const precio = parsearPrecio(
    comoTexto(primerValor(nodo, ['rawPrice', 'price', 'priceValue', 'transactions.0.price'])),
  );

  const metros = leerFeature(nodo, 'surface') ?? comoEntero(nodo.surface) ?? extraerMetros(texto);
  const habitaciones =
    leerFeature(nodo, 'rooms') ?? comoEntero(nodo.rooms) ?? extraerHabitaciones(texto);
  const banos =
    leerFeature(nodo, 'bathrooms') ?? comoEntero(nodo.bathrooms) ?? extraerBanos(texto);
  const plantaFeature = leerFeature(nodo, 'floor');

  const ubicacion = comoTexto(
    primerValor(nodo, [
      'address',
      'location',
      'neighborhood',
      'subtitle',
      'locations.0.name',
      'municipality',
    ]),
  );

  const imagen = primerValor(nodo, ['multimedia.0.src', 'photos.0.url', 'thumbnail', 'image']);

  return {
    portal: PORTAL,
    portalId,
    url: absoluta(urlBruta),
    titulo,
    precio,
    metros,
    habitaciones,
    banos,
    planta: plantaFeature !== null ? `${plantaFeature}ª` : extraerPlanta(texto),
    // Los extras solo llegan estructurados en la ficha, no en el listado; de
    // ahí que se acepten tanto un booleano del portal como el texto libre.
    ascensor: comoBooleano(primerValor(nodo, ['hasLift', 'lift', 'elevator'])) ?? tieneAscensor(texto),
    garaje: comoBooleano(primerValor(nodo, ['hasParking', 'parking', 'garage'])) ?? tieneGaraje(texto),
    terraza: comoBooleano(primerValor(nodo, ['hasTerrace', 'terrace'])) ?? tieneTerraza(texto),
    ubicacion,
    latitud: numeroONulo(primerValor(nodo, ['coordinates.latitude', 'latitude', 'lat'])),
    longitud: numeroONulo(primerValor(nodo, ['coordinates.longitude', 'longitude', 'lng'])),
    imagenUrl: comoTexto(imagen) ? absoluta(comoTexto(imagen) as string) : null,
  };
}

/** Plan B: JSON-LD de schema.org, que Fotocasa publica para los buscadores. */
function parsearDesdeJsonLd(html: string): AnuncioCrudo[] {
  const candidatos = filtrarPorTipo(extraerJsonLd(html), [
    'Product',
    'Residence',
    'Apartment',
    'House',
    'RealEstateListing',
  ]);

  const anuncios: AnuncioCrudo[] = [];
  for (const objeto of candidatos) {
    const url = comoTexto(primerValor(objeto, ['url', 'mainEntityOfPage']));
    const portalId = comoTexto(primerValor(objeto, ['sku', 'productID', 'identifier']));
    if (!url || !portalId) continue;

    const titulo = comoTexto(objeto.name) ?? '(sin título)';
    const texto = `${titulo} ${comoTexto(objeto.description) ?? ''}`;
    const imagenBruta = objeto.image;
    const imagen = comoTexto(Array.isArray(imagenBruta) ? imagenBruta[0] : imagenBruta);

    anuncios.push({
      portal: PORTAL,
      portalId,
      url: absoluta(url),
      titulo,
      precio: parsearPrecio(comoTexto(primerValor(objeto, ['offers.price', 'price']))),
      metros: comoEntero(primerValor(objeto, ['floorSize.value', 'floorSize'])) ?? extraerMetros(texto),
      habitaciones:
        comoEntero(primerValor(objeto, ['numberOfRooms.value', 'numberOfRooms'])) ??
        extraerHabitaciones(texto),
      banos: comoEntero(primerValor(objeto, ['numberOfBathroomsTotal'])) ?? extraerBanos(texto),
      planta: extraerPlanta(texto),
      ascensor: tieneAscensor(texto),
      garaje: tieneGaraje(texto),
      terraza: tieneTerraza(texto),
      ubicacion: comoTexto(primerValor(objeto, ['address.addressLocality', 'address'])),
      latitud: numeroONulo(primerValor(objeto, ['geo.latitude'])),
      longitud: numeroONulo(primerValor(objeto, ['geo.longitude'])),
      imagenUrl: imagen ? absoluta(imagen) : null,
    });
  }
  return anuncios;
}

/** Expuesto para los tests y el smoke: parsea una página ya descargada. */
export function parsearPagina(html: string): AnuncioCrudo[] {
  const estado = extraerEstadoEmbebido(html);
  const desdeEstado = estado === null
    ? []
    : buscarNodos(estado, pareceAnuncio)
        .map(parsearNodo)
        .filter((a): a is AnuncioCrudo => a !== null);

  // El estado embebido es la fuente rica (extras, coordenadas, features). El
  // JSON-LD solo entra si el estado no dio nada, para no mezclar dos
  // calidades de dato distintas en el mismo listado.
  const anuncios = desdeEstado.length > 0 ? desdeEstado : parsearDesdeJsonLd(html);

  const vistos = new Set<string>();
  return anuncios.filter((a) => {
    if (vistos.has(a.portalId)) return false;
    vistos.add(a.portalId);
    return true;
  });
}

export const fotocasaProvider: PortalProvider = {
  id: PORTAL,
  nombre: 'Fotocasa',

  puedeBuscar(criterios) {
    return criterios.ubicacion.trim()
      ? { ok: true }
      : { ok: false, motivo: 'Fotocasa necesita una ubicación con nombre' };
  },

  async buscar(criterios, opciones: OpcionesBusqueda = {}) {
    const maxPaginas = Math.max(1, opciones.maxPaginas ?? 2);
    const anuncios: AnuncioCrudo[] = [];
    const vistos = new Set<string>();

    for (let pagina = 1; pagina <= maxPaginas; pagina++) {
      const html = await fetchTexto(construirUrl(criterios, pagina), {
        portal: 'Fotocasa',
        timeoutMs: opciones.timeoutMs,
      });
      const anunciosPagina = parsearPagina(html);
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
