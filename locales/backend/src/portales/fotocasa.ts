import type { AnuncioCrudo } from '../types/locales';
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
  extraerSuperficieLocal,
} from './normalizar';

const BASE = 'https://www.fotocasa.es';
const PORTAL = 'fotocasa';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TODO EL CONOCIMIENTO ESPECÍFICO DE Fotocasa (LOCALES) VIVE EN ESTE BLOQUE.
 *
 * SIN VERIFICAR CONTRA EL PORTAL REAL (2026-09). El entorno de desarrollo no
 * tiene salida a internet: esta estructura está portada del rastreador de
 * `pisos` (sección de viviendas) y adaptada a la sección de locales. El único
 * chequeo real es `npm run smoke -- fotocasa "<zona>"`; espérese un ajuste.
 *
 * URL de locales en venta (conjetura): Fotocasa usa el segmento de tipo de
 * inmueble en la ruta. Para viviendas es `/es/comprar/viviendas/…`; para
 * locales se prueba `/es/comprar/locales/<zona>/todas-las-zonas/l/`. Si el
 * portal no reconoce `locales`, el candidato alternativo es `local-comercial`.
 *
 * Igual que en viviendas, Fotocasa renderiza en servidor y deja el listado en
 * un `<script type="application/json" id="__initial_props__">`; cada anuncio
 * es un nodo con `id` numérico, `rawPrice` y `features: [{ key, value }]`. Se
 * buscan por FORMA, no por ruta exacta.
 *
 *   id · rawPrice · price "138.000 €" · detail["es-ES"] · transactionTypeId (1 = venta)
 *   buildingType/buildingSubtype: "Premises" | "Office" | "Warehouse" | "Flat" | …
 *   features: [{ key: "surface", value: [120] }, …]
 *   address: { municipality, district, province } · coordinates: { latitude, longitude }
 * ─────────────────────────────────────────────────────────────────────────
 */
function construirUrl(criterios: CriteriosPortal, pagina: number): string {
  const base = slugificar(criterios.zonaTexto);
  const zona = esCapitalDeProvincia(criterios.zonaTexto) ? `${base}-capital` : base;
  const ruta = `/es/comprar/locales/${zona}/todas-las-zonas/l/${pagina > 1 ? pagina : ''}`;

  const params = new URLSearchParams();
  if (criterios.precioMin !== null) params.set('minPrice', String(criterios.precioMin));
  if (criterios.precioMax !== null) params.set('maxPrice', String(criterios.precioMax));
  if (criterios.superficieMin !== null) params.set('minSurface', String(criterios.superficieMin));
  if (criterios.superficieMax !== null) params.set('maxSurface', String(criterios.superficieMax));
  params.set('sortType', 'publicationDate');

  return `${BASE}${ruta.replace(/\/$/, '')}?${params.toString()}`;
}

/** Subtipos residenciales: aunque salgan en el listado, no son un local. */
const SUBTIPOS_RESIDENCIALES = [
  'flat', 'apartment', 'penthouse', 'duplex', 'studio', 'loft', 'house',
  'chalet', 'villa', 'townhouse', 'countryhouse', 'rusticproperty',
];

/** Subtipos que SÍ son un local comercial / nave / oficina. */
const SUBTIPOS_LOCAL = [
  'premises', 'local', 'commercial', 'business', 'office', 'warehouse',
  'industrial', 'store', 'shop', 'nave',
];

function pareceAnuncio(nodo: Record<string, unknown>): boolean {
  const tieneId = nodo.id !== undefined || nodo.realEstateId !== undefined;
  const tienePrecio = nodo.rawPrice !== undefined || nodo.price !== undefined;
  const esListado = Array.isArray(nodo.features) || nodo.detail !== undefined || nodo.buildingSubtype !== undefined;
  if (!(tieneId && tienePrecio && esListado)) return false;

  // Alquiler fuera: esta app es solo compra.
  if (nodo.transactionTypeId !== undefined && nodo.transactionTypeId !== 1) return false;

  const subtipo = comoTexto(primerValor(nodo, ['buildingSubtype', 'buildingType']))?.toLowerCase() ?? '';
  if (SUBTIPOS_RESIDENCIALES.some((s) => subtipo.includes(s))) return false;
  // Si el subtipo dice explícitamente que es residencial, ya se descartó. Si
  // dice que es local, entra. Si no dice nada, se acepta: el listado ya venía
  // filtrado por la URL de locales.
  return true;
}

function leerFeature(nodo: Record<string, unknown>, clave: string): number | null {
  const features = nodo.features;
  if (!Array.isArray(features)) return null;
  for (const feature of features) {
    if (feature === null || typeof feature !== 'object') continue;
    const f = feature as Record<string, unknown>;
    const key = comoTexto(f.key ?? f.type ?? f.name);
    if (!key || key.toLowerCase() !== clave.toLowerCase()) continue;
    return comoEntero(Array.isArray(f.value) ? f.value[0] : f.value);
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

function esSubtipoLocal(subtipo: string): boolean {
  return SUBTIPOS_LOCAL.some((s) => subtipo.includes(s));
}

function parsearNodo(nodo: Record<string, unknown>): AnuncioCrudo | null {
  const portalId = comoTexto(primerValor(nodo, ['id', 'realEstateId', 'realEstateAdId', 'adId']));
  if (!portalId) return null;

  const urlBruta = comoTexto(
    primerValor(nodo, ['detail.es-ES', 'detailWithParams.es-ES', 'detail.es', 'detailUrl', 'url', 'link', 'slug']),
  );
  if (!urlBruta) return null;

  const descripcion =
    decodificarEntidades(comoTexto(primerValor(nodo, ['description', 'comment'])) ?? '') || null;

  const subtipo = comoTexto(primerValor(nodo, ['buildingSubtype', 'buildingType']))?.toLowerCase() ?? '';
  const municipio = comoTexto(primerValor(nodo, ['address.municipality', 'address.city']));
  const distrito = comoTexto(primerValor(nodo, ['address.district', 'address.neighborhood']));
  const provincia = comoTexto(primerValor(nodo, ['address.province']));
  const etiqueta = esSubtipoLocal(subtipo) ? 'Local' : 'Local comercial';
  const titulo = decodificarEntidades(
    [etiqueta, distrito || municipio ? `en ${distrito ?? municipio}` : ''].filter(Boolean).join(' ') || '(sin título)',
  );

  const texto = `${titulo} ${descripcion ?? ''}`;
  const precio = parsearPrecio(comoTexto(primerValor(nodo, ['rawPrice', 'price', 'priceValue'])));
  const superficieM2 =
    leerFeature(nodo, 'surface') ?? comoEntero(nodo.surface) ?? extraerSuperficieLocal(texto);

  const direccion =
    decodificarEntidades([distrito, municipio].filter(Boolean).join(', ')) || null;

  const imagen = primerValor(nodo, ['multimedia.0.src', 'multimedia.0.url', 'photos.0.url', 'thumbnail', 'image']);
  const lat = numeroONulo(primerValor(nodo, ['coordinates.latitude', 'latitude', 'lat']));
  const lng = numeroONulo(primerValor(nodo, ['coordinates.longitude', 'longitude', 'lng']));

  return {
    tipo: 'local',
    portal: PORTAL,
    portalId,
    url: absoluta(urlBruta),
    titulo,
    descripcion,
    precio,
    precioAnterior: null,
    superficieM2,
    facturacion: null,
    direccion,
    municipio: municipio ? decodificarEntidades(municipio) : null,
    provincia: provincia ? decodificarEntidades(provincia) : null,
    comunidad: null,
    latitud: lat,
    longitud: lng,
    precision: lat !== null && lng !== null ? 'aproximada' : 'desconocida',
    imagenUrl: comoTexto(imagen) ? absoluta(comoTexto(imagen) as string) : null,
  };
}

/** Plan B: JSON-LD de schema.org. */
function parsearDesdeJsonLd(html: string): AnuncioCrudo[] {
  const candidatos = filtrarPorTipo(extraerJsonLd(html), [
    'Product', 'RealEstateListing', 'Store', 'Place', 'Offer',
  ]);

  const anuncios: AnuncioCrudo[] = [];
  for (const objeto of candidatos) {
    const url = comoTexto(primerValor(objeto, ['url', 'mainEntityOfPage']));
    const portalId = comoTexto(primerValor(objeto, ['sku', 'productID', 'identifier']));
    if (!url || !portalId) continue;

    const titulo = comoTexto(objeto.name) ?? 'Local comercial';
    const descripcion = comoTexto(objeto.description);
    const texto = `${titulo} ${descripcion ?? ''}`;
    const imagenBruta = objeto.image;
    const imagen = comoTexto(Array.isArray(imagenBruta) ? imagenBruta[0] : imagenBruta);
    const lat = numeroONulo(primerValor(objeto, ['geo.latitude']));
    const lng = numeroONulo(primerValor(objeto, ['geo.longitude']));

    anuncios.push({
      tipo: 'local',
      portal: PORTAL,
      portalId,
      url: absoluta(url),
      titulo,
      descripcion: descripcion ?? null,
      precio: parsearPrecio(comoTexto(primerValor(objeto, ['offers.price', 'price']))),
      precioAnterior: null,
      superficieM2:
        comoEntero(primerValor(objeto, ['floorSize.value', 'floorSize'])) ?? extraerSuperficieLocal(texto),
      facturacion: null,
      direccion: comoTexto(primerValor(objeto, ['address.streetAddress', 'address'])),
      municipio: comoTexto(primerValor(objeto, ['address.addressLocality'])),
      provincia: comoTexto(primerValor(objeto, ['address.addressRegion'])),
      comunidad: null,
      latitud: lat,
      longitud: lng,
      precision: lat !== null && lng !== null ? 'aproximada' : 'desconocida',
      imagenUrl: imagen ? absoluta(imagen) : null,
    });
  }
  return anuncios;
}

/** Expuesto para los tests y el smoke: parsea una página ya descargada. */
export function parsearPagina(html: string): AnuncioCrudo[] {
  const estado = extraerEstadoEmbebido(html);
  const desdeEstado =
    estado === null
      ? []
      : buscarNodos(estado, pareceAnuncio)
          .map(parsearNodo)
          .filter((a): a is AnuncioCrudo => a !== null);

  const anuncios = desdeEstado.length > 0 ? desdeEstado : parsearDesdeJsonLd(html);

  const vistos = new Set<string>();
  return anuncios.filter((a) => {
    if (vistos.has(a.portalId)) return false;
    vistos.add(a.portalId);
    return true;
  });
}

async function recorrer(
  construir: (pagina: number) => string,
  opciones: OpcionesBusqueda,
): Promise<AnuncioCrudo[]> {
  const maxPaginas = Math.max(1, opciones.maxPaginas ?? 2);
  const anuncios: AnuncioCrudo[] = [];
  const vistos = new Set<string>();

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const html = await fetchTexto(construir(pagina), { portal: 'Fotocasa', timeoutMs: opciones.timeoutMs });
    const anunciosPagina = parsearPagina(html);
    if (anunciosPagina.length === 0) break;
    for (const anuncio of anunciosPagina) {
      if (vistos.has(anuncio.portalId)) continue;
      vistos.add(anuncio.portalId);
      anuncios.push(anuncio);
    }
  }
  return anuncios;
}

export const fotocasaProvider: PortalProvider = {
  id: PORTAL,
  nombre: 'Fotocasa',
  tipo: 'local',

  puedeBuscar(criterios) {
    return criterios.zonaTexto.trim()
      ? { ok: true }
      : { ok: false, motivo: 'Fotocasa necesita una zona con nombre' };
  },

  buscar(criterios, opciones: OpcionesBusqueda = {}) {
    return recorrer((pagina) => construirUrl(criterios, pagina), opciones);
  },

  puedeParsearUrl(url) {
    return /(^|\.)fotocasa\.es\//i.test(url);
  },

  async parsearUrl(url, opciones: OpcionesBusqueda = {}) {
    if (!this.puedeParsearUrl(url)) return null;
    const html = await fetchTexto(url, { portal: 'Fotocasa', timeoutMs: opciones.timeoutMs });
    return parsearPagina(html)[0] ?? null;
  },
};
