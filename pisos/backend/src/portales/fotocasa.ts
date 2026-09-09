import type { AnuncioCrudo, TipoInmueble } from '../types/pisos';
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
} from './extraer';
import {
  parsearPrecio,
  slugificar,
  esCapitalDeProvincia,
  decodificarEntidades,
  extraerMetros,
  extraerSuperficieLocal,
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
 * Fotocasa renderiza en servidor y deja el listado en un
 * `<script type="application/json" id="__initial_props__">`. Dentro, cada
 * anuncio es un nodo del array `realEstates`. En vez de fijar la RUTA exacta
 * a ese array (cambia con cada despliegue de su front), se buscan nodos por
 * su FORMA: un objeto con `id` numérico, `rawPrice` y `features`. Eso
 * sobrevive a un renombrado de la ruta, que es el modo de fallo habitual.
 *
 * Forma del nodo (2026-08):
 *   id: 190620092 · rawPrice: 138000 · price: "138.000 €"
 *   detail: { "es-ES": "/es/comprar/vivienda/.../190620092/d" }
 *   buildingType/buildingSubtype: "Flat" | "House_Chalet" | "Penthouse" | …
 *   transactionTypeId: 1 = venta
 *   address: { municipality, district, city, province, … }
 *   coordinates: { latitude, longitude }
 *   features: [{ key: "surface"|"rooms"|"bathrooms"|"elevator"|…, value }]
 *   multimedia: [{ type: "image", src }]
 *
 * Verificar con:  npm run smoke -- fotocasa "Badajoz"
 *                 npm run smoke -- fotocasa "Badajoz" --tipo local
 *
 * SECCIÓN COMERCIAL SIN VERIFICAR (2026-09): el segmento `/es/comprar/locales/`
 * está portado de `locales/backend/src/portales/fotocasa.ts` y no se ha
 * comprobado contra el portal en vivo. Candidato alternativo: `local-comercial`.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Segmento de la ruta de Fotocasa según el tipo de inmueble. */
const SECCION: Record<TipoInmueble, string> = { vivienda: 'viviendas', local: 'locales' };

function construirUrl(criterios: CriteriosPortal, pagina: number): string {
  // En Fotocasa "caceres" es la provincia y "caceres-capital" la ciudad.
  const base = slugificar(criterios.ubicacion);
  const zona = esCapitalDeProvincia(criterios.ubicacion) ? `${base}-capital` : base;
  const ruta = `/es/comprar/${SECCION[criterios.tipo]}/${zona}/todas-las-zonas/l/${pagina > 1 ? pagina : ''}`;

  const params = new URLSearchParams();
  if (criterios.precioMin !== null) params.set('minPrice', String(criterios.precioMin));
  if (criterios.precioMax !== null) params.set('maxPrice', String(criterios.precioMax));
  if (criterios.metrosMin !== null) params.set('minSurface', String(criterios.metrosMin));
  if (criterios.metrosMax !== null) params.set('maxSurface', String(criterios.metrosMax));
  // `minRooms` solo tiene sentido en vivienda: un local no se filtra por
  // habitaciones y mandar el parámetro sería un embudo inventado.
  if (criterios.tipo === 'vivienda' && criterios.habitacionesMin !== null) {
    params.set('minRooms', String(criterios.habitacionesMin));
  }
  // "Lo más reciente primero": sin esto el portal ordena por relevancia y un
  // piso recién publicado puede caer en la página 7.
  params.set('sortType', 'publicationDate');

  return `${BASE}${ruta.replace(/\/$/, '')}?${params.toString()}`;
}

/** Subtipos que no son vivienda: no interesan aunque salgan en el listado. */
const SUBTIPOS_NO_VIVIENDA = new Set([
  'garage', 'parking', 'land', 'terrain', 'plot', 'office', 'business',
  'commercial', 'local', 'premises', 'building', 'storage', 'industrial',
]);

/** Subtipos residenciales: en una búsqueda de local no interesan. */
const SUBTIPOS_NO_LOCAL = new Set([
  'flat', 'apartment', 'penthouse', 'duplex', 'studio', 'loft', 'house',
  'chalet', 'villa', 'townhouse', 'countryhouse', 'rusticproperty',
]);

/**
 * Tabla de rechazo por tipo, no dos predicados. En ambos casos un subtipo
 * DESCONOCIDO se acepta: la URL ya filtró y rechazar por silencio perdería
 * anuncios (principio transversal de la app).
 */
const SUBTIPOS_RECHAZADOS: Record<TipoInmueble, Set<string>> = {
  vivienda: SUBTIPOS_NO_VIVIENDA,
  local: SUBTIPOS_NO_LOCAL,
};

/** ¿Este nodo del estado embebido tiene pinta de ser un anuncio del tipo buscado? */
function pareceAnuncio(nodo: Record<string, unknown>, tipo: TipoInmueble): boolean {
  const tieneId = typeof nodo.id === 'number' || nodo.id !== undefined || nodo.realEstateId !== undefined;
  const tienePrecio = nodo.rawPrice !== undefined || nodo.price !== undefined;
  const esListado = Array.isArray(nodo.features) || nodo.detail !== undefined || nodo.buildingSubtype !== undefined;
  if (!(tieneId && tienePrecio && esListado)) return false;

  // Alquiler fuera: esta app es solo compra.
  if (nodo.transactionTypeId !== undefined && nodo.transactionTypeId !== 1) return false;

  const subtipo = comoTexto(primerValor(nodo, ['buildingSubtype', 'buildingType']))?.toLowerCase() ?? '';
  if ([...SUBTIPOS_RECHAZADOS[tipo]].some((s) => subtipo.includes(s))) return false;

  return true;
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

/** buildingSubtype de Fotocasa → una palabra legible para el título. */
const SUBTIPO_LEGIBLE: Record<string, string> = {
  flat: 'Piso',
  apartment: 'Apartamento',
  penthouse: 'Ático',
  duplex: 'Dúplex',
  studio: 'Estudio',
  loft: 'Loft',
  house_chalet: 'Casa o chalet',
  house: 'Casa',
  chalet: 'Chalet',
  villa: 'Chalet',
  townhouse: 'Casa adosada',
  groundfloorwithgarden: 'Bajo con jardín',
  rusticproperty: 'Casa rural',
  countryhouse: 'Casa de campo',
};

/** ¿El nodo lista esta `feature` por su clave? (presencia = la tiene). */
function tieneFeature(nodo: Record<string, unknown>, clave: string): boolean | null {
  const features = nodo.features;
  if (!Array.isArray(features)) return null;
  return features.some((f) => {
    if (f === null || typeof f !== 'object') return false;
    const key = comoTexto((f as Record<string, unknown>).key);
    return key?.toLowerCase() === clave.toLowerCase();
  })
    ? true
    : null;
}

function parsearNodo(nodo: Record<string, unknown>, tipo: TipoInmueble): AnuncioCrudo | null {
  const portalId = comoTexto(primerValor(nodo, ['id', 'realEstateId', 'realEstateAdId', 'adId']));
  if (!portalId) return null;

  // La URL de la ficha va bajo una clave de idioma: detail["es-ES"].
  const urlBruta = comoTexto(
    primerValor(nodo, [
      'detail.es-ES',
      'detailWithParams.es-ES',
      'detail.es',
      'detailUrl',
      'url',
      'link',
      'slug',
    ]),
  );
  if (!urlBruta) return null;

  const descripcion = decodificarEntidades(comoTexto(primerValor(nodo, ['description', 'comment'])) ?? '');

  const subtipo = comoTexto(primerValor(nodo, ['buildingSubtype', 'buildingType']))?.toLowerCase() ?? '';
  const municipio = comoTexto(primerValor(nodo, ['address.municipality', 'address.city']));
  const distrito = comoTexto(primerValor(nodo, ['address.district', 'address.neighborhood']));
  const etiquetaTipo = SUBTIPO_LEGIBLE[subtipo] ?? (tipo === 'local' ? 'Local' : 'Vivienda');
  const titulo = decodificarEntidades(
    [etiquetaTipo, distrito || municipio ? `en ${distrito ?? municipio}` : '']
      .filter(Boolean)
      .join(' ') || '(sin título)',
  );

  const texto = `${titulo} ${descripcion}`;

  const precio = parsearPrecio(
    comoTexto(primerValor(nodo, ['rawPrice', 'price', 'priceValue'])),
  );

  const extraerSuperficie = tipo === 'local' ? extraerSuperficieLocal : extraerMetros;
  const metros = leerFeature(nodo, 'surface') ?? comoEntero(nodo.surface) ?? extraerSuperficie(texto);
  const habitaciones =
    leerFeature(nodo, 'rooms') ?? comoEntero(nodo.rooms) ?? extraerHabitaciones(texto);
  const banos =
    leerFeature(nodo, 'bathrooms') ?? comoEntero(nodo.bathrooms) ?? extraerBanos(texto);

  const ubicacion = decodificarEntidades(
    [distrito, municipio].filter(Boolean).join(', ') ||
      comoTexto(primerValor(nodo, ['address.province', 'location'])) ||
      '',
  ) || null;

  const imagen = primerValor(nodo, ['multimedia.0.src', 'multimedia.0.url', 'photos.0.url', 'thumbnail', 'image']);

  return {
    tipo,
    portal: PORTAL,
    portalId,
    url: absoluta(urlBruta),
    titulo,
    precio,
    metros,
    habitaciones,
    banos,
    // El `floor` de features es un id de enum, no el número de planta; solo
    // se puede afirmar la planta desde el texto libre de la descripción.
    planta: extraerPlanta(texto),
    ascensor: tieneFeature(nodo, 'elevator') ?? tieneAscensor(texto),
    garaje:
      tieneFeature(nodo, 'parking') ??
      tieneFeature(nodo, 'garage') ??
      tieneGaraje(texto),
    terraza: tieneFeature(nodo, 'terrace') ?? tieneTerraza(texto),
    ubicacion,
    latitud: numeroONulo(primerValor(nodo, ['coordinates.latitude', 'latitude', 'lat'])),
    longitud: numeroONulo(primerValor(nodo, ['coordinates.longitude', 'longitude', 'lng'])),
    imagenUrl: comoTexto(imagen) ? absoluta(comoTexto(imagen) as string) : null,
  };
}

/** Plan B: JSON-LD de schema.org, que Fotocasa publica para los buscadores. */
function parsearDesdeJsonLd(html: string, tipo: TipoInmueble): AnuncioCrudo[] {
  const tiposLd =
    tipo === 'local'
      ? ['Product', 'RealEstateListing', 'Store', 'Place', 'Offer']
      : ['Product', 'Residence', 'Apartment', 'House', 'RealEstateListing'];
  const candidatos = filtrarPorTipo(extraerJsonLd(html), tiposLd);
  const extraerSuperficie = tipo === 'local' ? extraerSuperficieLocal : extraerMetros;

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
      tipo,
      portal: PORTAL,
      portalId,
      url: absoluta(url),
      titulo,
      precio: parsearPrecio(comoTexto(primerValor(objeto, ['offers.price', 'price']))),
      metros: comoEntero(primerValor(objeto, ['floorSize.value', 'floorSize'])) ?? extraerSuperficie(texto),
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

/**
 * Expuesto para los tests y el smoke: parsea una página ya descargada.
 * `tipo` por defecto `vivienda` para no tocar tests ni smoke existentes.
 */
export function parsearPagina(html: string, tipo: TipoInmueble = 'vivienda'): AnuncioCrudo[] {
  const estado = extraerEstadoEmbebido(html);
  const desdeEstado = estado === null
    ? []
    : buscarNodos(estado, (nodo) => pareceAnuncio(nodo, tipo))
        .map((nodo) => parsearNodo(nodo, tipo))
        .filter((a): a is AnuncioCrudo => a !== null);

  // El estado embebido es la fuente rica (extras, coordenadas, features). El
  // JSON-LD solo entra si el estado no dio nada, para no mezclar dos
  // calidades de dato distintas en el mismo listado.
  const anuncios = desdeEstado.length > 0 ? desdeEstado : parsearDesdeJsonLd(html, tipo);

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
      const anunciosPagina = parsearPagina(html, criterios.tipo);
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
