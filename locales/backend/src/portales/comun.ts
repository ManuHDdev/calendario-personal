/**
 * Piezas compartidas por varios providers.
 *
 * NO es donde vive el conocimiento de un portal concreto —eso está en su
 * propio fichero, en el bloque `─────`— sino las dos formas de parseo que se
 * repiten: (a) listado SSR con estado embebido + JSON-LD (habitaclia,
 * yaencontre), y (b) tarjetas de intermediario de farmacias, donde casi todo
 * es texto libre.
 */

import type { AnuncioCrudo, PrecisionCoordenadas, TipoBusqueda } from '../types/locales';
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
  decodificarEntidades,
  parsearPrecio,
  extraerSuperficieLocal,
  extraerFacturacion,
  normalizarTexto,
} from './normalizar';

function numeroONulo(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'string') {
    const n = Number(valor.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function absolutizar(base: string, url: string): string {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

export interface OpcionesListado {
  portal: string;
  base: string;
  tipo: TipoBusqueda;
  /** Palabras que, si aparecen en el subtipo/título, descartan el anuncio. */
  rechazarSi?: string[];
  jsonLdTipos?: string[];
}

function pareceAnuncioGenerico(nodo: Record<string, unknown>): boolean {
  const tieneId =
    nodo.id !== undefined || nodo.adId !== undefined || nodo.propertyId !== undefined || nodo.reference !== undefined;
  const tienePrecio =
    nodo.price !== undefined || nodo.rawPrice !== undefined || nodo.priceValue !== undefined || nodo.amount !== undefined;
  const pintaListado =
    nodo.url !== undefined || nodo.detail !== undefined || nodo.slug !== undefined || nodo.link !== undefined ||
    nodo.surface !== undefined || nodo.surfaceArea !== undefined;
  return Boolean(tieneId && tienePrecio && pintaListado);
}

function nodoAAnuncio(nodo: Record<string, unknown>, opts: OpcionesListado): AnuncioCrudo | null {
  const portalId = comoTexto(primerValor(nodo, ['id', 'adId', 'propertyId', 'reference', 'ref']));
  if (!portalId) return null;
  const urlBruta = comoTexto(primerValor(nodo, ['url', 'detail', 'detailUrl', 'link', 'slug', 'permalink']));
  if (!urlBruta) return null;

  const subtipo = normalizarTexto(comoTexto(primerValor(nodo, ['subtype', 'propertySubtype', 'buildingSubtype', 'type'])) ?? '');
  const titulo = decodificarEntidades(comoTexto(primerValor(nodo, ['title', 'name', 'headline'])) ?? 'Local comercial');
  if (opts.rechazarSi?.some((p) => subtipo.includes(p) || normalizarTexto(titulo).includes(p))) return null;

  const descripcion = decodificarEntidades(comoTexto(primerValor(nodo, ['description', 'comment', 'body'])) ?? '') || null;
  const texto = `${titulo} ${descripcion ?? ''}`;
  const lat = numeroONulo(primerValor(nodo, ['coordinates.latitude', 'latitude', 'lat', 'geo.latitude']));
  const lng = numeroONulo(primerValor(nodo, ['coordinates.longitude', 'longitude', 'lng', 'lon', 'geo.longitude']));

  return {
    tipo: opts.tipo,
    portal: opts.portal,
    portalId,
    url: absolutizar(opts.base, urlBruta),
    titulo,
    descripcion,
    precio:
      parsearPrecio(comoTexto(primerValor(nodo, ['price', 'rawPrice', 'priceValue', 'amount', 'price.amount']))),
    precioAnterior: parsearPrecio(comoTexto(primerValor(nodo, ['priceDrop', 'previousPrice', 'oldPrice']))),
    superficieM2:
      comoEntero(primerValor(nodo, ['surface', 'surfaceArea', 'size', 'constructedArea', 'features.surface'])) ??
      extraerSuperficieLocal(texto),
    facturacion: opts.tipo === 'farmacia' ? extraerFacturacion(texto) : null,
    direccion: comoTexto(primerValor(nodo, ['address', 'address.streetAddress', 'location.address'])),
    municipio: comoTexto(primerValor(nodo, ['municipality', 'town', 'city', 'address.addressLocality', 'location.city'])),
    provincia: comoTexto(primerValor(nodo, ['province', 'address.addressRegion', 'location.province'])),
    comunidad: comoTexto(primerValor(nodo, ['region', 'autonomousRegion', 'ccaa'])),
    latitud: lat,
    longitud: lng,
    precision: lat !== null && lng !== null ? 'aproximada' : 'desconocida',
    imagenUrl: (() => {
      const img = primerValor(nodo, ['image', 'thumbnail', 'photo', 'mainImage', 'multimedia.0.url', 'photos.0.url', 'images.0']);
      const txt = comoTexto(Array.isArray(img) ? img[0] : img);
      return txt ? absolutizar(opts.base, txt) : null;
    })(),
  };
}

function jsonLdAAnuncio(objeto: Record<string, unknown>, opts: OpcionesListado): AnuncioCrudo | null {
  const url = comoTexto(primerValor(objeto, ['url', 'mainEntityOfPage', '@id']));
  const portalId = comoTexto(primerValor(objeto, ['sku', 'productID', 'identifier', '@id']));
  if (!url || !portalId) return null;

  const titulo = decodificarEntidades(comoTexto(objeto.name) ?? (opts.tipo === 'farmacia' ? 'Farmacia en venta' : 'Local comercial'));
  const descripcion = decodificarEntidades(comoTexto(objeto.description) ?? '') || null;
  if (opts.rechazarSi?.some((p) => normalizarTexto(titulo).includes(p))) return null;
  const texto = `${titulo} ${descripcion ?? ''}`;
  const imagenBruta = objeto.image;
  const imagen = comoTexto(Array.isArray(imagenBruta) ? imagenBruta[0] : imagenBruta);
  const lat = numeroONulo(primerValor(objeto, ['geo.latitude']));
  const lng = numeroONulo(primerValor(objeto, ['geo.longitude']));

  return {
    tipo: opts.tipo,
    portal: opts.portal,
    portalId,
    url: absolutizar(opts.base, url),
    titulo,
    descripcion,
    precio: parsearPrecio(comoTexto(primerValor(objeto, ['offers.price', 'price']))),
    precioAnterior: null,
    superficieM2:
      comoEntero(primerValor(objeto, ['floorSize.value', 'floorSize'])) ?? extraerSuperficieLocal(texto),
    facturacion: opts.tipo === 'farmacia' ? extraerFacturacion(texto) : null,
    direccion: comoTexto(primerValor(objeto, ['address.streetAddress'])),
    municipio: comoTexto(primerValor(objeto, ['address.addressLocality'])),
    provincia: comoTexto(primerValor(objeto, ['address.addressRegion'])),
    comunidad: null,
    latitud: lat,
    longitud: lng,
    precision: lat !== null && lng !== null ? 'aproximada' : 'desconocida',
    imagenUrl: imagen ? absolutizar(opts.base, imagen) : null,
  };
}

/**
 * Parseo (a): estado embebido por forma, y si no da nada, JSON-LD. Nunca los
 * mezcla — dos calidades de dato distintas en el mismo listado.
 */
export function parsearListadoSSR(html: string, opts: OpcionesListado): AnuncioCrudo[] {
  const estado = extraerEstadoEmbebido(html);
  const desdeEstado =
    estado === null
      ? []
      : buscarNodos(estado, pareceAnuncioGenerico)
          .map((n) => nodoAAnuncio(n, opts))
          .filter((a): a is AnuncioCrudo => a !== null);

  const desdeJsonLd =
    desdeEstado.length > 0
      ? []
      : filtrarPorTipo(extraerJsonLd(html), opts.jsonLdTipos ?? ['Product', 'RealEstateListing', 'Store', 'Place', 'Offer'])
          .map((o) => jsonLdAAnuncio(o, opts))
          .filter((a): a is AnuncioCrudo => a !== null);

  const anuncios = desdeEstado.length > 0 ? desdeEstado : desdeJsonLd;
  const vistos = new Set<string>();
  return anuncios.filter((a) => {
    if (vistos.has(a.portalId)) return false;
    vistos.add(a.portalId);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Parseo (b): tarjetas de intermediario de farmacias
// ---------------------------------------------------------------------------

const CCAA_TEXTO: Array<[RegExp, string]> = [
  [/madrid/, 'madrid'],
  [/catalu|barcelona|girona|lleida|tarragona/, 'cataluna'],
  [/andaluc|sevilla|malaga|granada|cadiz|cordoba|almeria|huelva|jaen/, 'andalucia'],
  [/valencia|alicante|castellon|comunidad valenciana/, 'valenciana'],
  [/galicia|coruna|pontevedra|lugo|ourense/, 'galicia'],
  [/pais vasco|euskadi|vizcaya|bizkaia|guipuzcoa|alava/, 'pais-vasco'],
  [/castilla y leon|valladolid|burgos|leon|salamanca|segovia|soria|zamora|palencia|avila/, 'castilla-leon'],
  [/castilla-la mancha|castilla la mancha|toledo|albacete|ciudad real|cuenca|guadalajara/, 'castilla-mancha'],
  [/arag|zaragoza|huesca|teruel/, 'aragon'],
  [/murcia/, 'murcia'],
  [/asturias/, 'asturias'],
  [/cantabria/, 'cantabria'],
  [/navarra/, 'navarra'],
  [/rioja/, 'rioja'],
  [/extremadura|badajoz|caceres/, 'extremadura'],
  [/baleares|mallorca|menorca|ibiza/, 'baleares'],
  [/canarias|tenerife|las palmas|gran canaria/, 'canarias'],
];

/** Deduce la comunidad autónoma a partir de un texto de ubicación difuso. */
export function comunidadDeTexto(texto: string | null): string | null {
  if (!texto) return null;
  const t = normalizarTexto(texto);
  for (const [patron, ccaa] of CCAA_TEXTO) if (patron.test(t)) return ccaa;
  return null;
}

export interface TarjetaFarmacia {
  bloque: string;
  base: string;
  portal: string;
}

/**
 * Trocea el HTML en bloques que empiezan en cada coincidencia de `inicio` y
 * terminan en el inicio del siguiente (o +`ventana` para el último).
 */
export function trocear(html: string, inicio: RegExp, ventana = 8000): string[] {
  const regex = new RegExp(inicio.source, inicio.flags.includes('g') ? inicio.flags : `${inicio.flags}g`);
  const indices: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    indices.push(m.index);
    if (m.index === regex.lastIndex) regex.lastIndex++;
  }
  return indices.map((desde, i) => html.slice(desde, i + 1 < indices.length ? indices[i + 1] : desde + ventana));
}

export function primerGrupo(bloque: string, patron: RegExp): string | null {
  const m = bloque.match(patron);
  return m ? decodificarEntidades(m[1]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null : null;
}

/** Precisión por defecto cuando una farmacia intermediada no da coordenadas. */
export const PRECISION_SIN_COORDS: PrecisionCoordenadas = 'desconocida';

export interface OpcionesFarmacia {
  portal: string;
  base: string;
  /** Regex que marca el inicio de cada tarjeta de anuncio en el HTML. */
  inicioTarjeta: RegExp;
  /** Regex (grupo 1 = href) para la URL de la ficha dentro de la tarjeta. */
  patronUrl?: RegExp;
  ventana?: number;
}

const PATRON_URL_DEFECTO = /href="([^"#?]+(?:farmacia|referencia|ref|detalle|anuncio|ficha|venta)[^"]*)"/i;
const PATRON_TITULO = /<(?:h[1-4]|span|a|div)[^>]*>([^<]{6,140})<\/(?:h[1-4]|span|a|div)>/i;

/**
 * Parseo (b): listado de un intermediario de farmacias. Casi todo es texto
 * libre; lo único fiable es el patrón "facturación NNN €" y la mención de
 * provincia/comunidad. Sin dirección exacta ⇒ sin coordenadas y
 * `precision: 'desconocida'` — que para una farmacia intermediada es su forma
 * normal, no un error.
 *
 * SELECTORES SIN VERIFICAR: cada portal pasa su `inicioTarjeta`; si el smoke
 * da cero resultados, ese regex es lo primero a ajustar.
 */
export function parsearListadoFarmacia(html: string, opts: OpcionesFarmacia): AnuncioCrudo[] {
  // Plan A: JSON-LD, si el portal lo publica.
  const desdeJsonLd = filtrarPorTipo(extraerJsonLd(html), ['Product', 'Offer', 'ItemList', 'Service'])
    .map((o) => jsonLdAAnuncio(o, { portal: opts.portal, base: opts.base, tipo: 'farmacia' }))
    .filter((a): a is AnuncioCrudo => a !== null);

  const bloques = trocear(html, opts.inicioTarjeta, opts.ventana ?? 6000);
  const patronUrl = opts.patronUrl ?? PATRON_URL_DEFECTO;

  const desdeHtml: AnuncioCrudo[] = [];
  for (const bloque of bloques) {
    const href = bloque.match(patronUrl)?.[1] ?? bloque.match(/href="([^"#?]+)"/)?.[1];
    if (!href) continue;

    const texto = decodificarEntidades(bloque.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    const titulo = primerGrupo(bloque, PATRON_TITULO) ?? 'Farmacia en venta';
    const facturacion = extraerFacturacion(texto);
    const precio = parsearPrecio(
      (texto.match(/precio(?:\s+de\s+venta)?[^\d]{0,15}(\d[\d.,]*)\s*(?:€|eur)/i) ?? [])[1] ?? null,
    );
    const municipio = (texto.match(/(?:en|zona|provincia\s+de|situada\s+en)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ.\- ]{2,40})/) ?? [])[1]?.trim() ?? null;

    desdeHtml.push({
      tipo: 'farmacia',
      portal: opts.portal,
      portalId: slugId(href),
      url: absolutizar(opts.base, href),
      titulo,
      descripcion: texto.slice(0, 500) || null,
      precio,
      precioAnterior: null,
      superficieM2: extraerSuperficieLocal(texto),
      facturacion,
      direccion: null,
      municipio,
      provincia: municipio,
      comunidad: comunidadDeTexto(texto),
      latitud: null,
      longitud: null,
      precision: PRECISION_SIN_COORDS,
      imagenUrl: (() => {
        const m = bloque.match(/<img[^>]+(?:src|data-src)="([^"]+)"/i);
        return m ? absolutizar(opts.base, m[1]) : null;
      })(),
    });
  }

  const todos = desdeJsonLd.length > 0 ? desdeJsonLd : desdeHtml;
  const vistos = new Set<string>();
  return todos.filter((a) => {
    if (!a.portalId || vistos.has(a.portalId)) return false;
    vistos.add(a.portalId);
    return true;
  });
}

function slugId(href: string): string {
  const limpio = href.split('?')[0].replace(/\/$/, '');
  return limpio.slice(limpio.lastIndexOf('/') + 1) || limpio;
}

/**
 * Geocodifica los anuncios que traen una cadena de ubicación pero no
 * coordenadas. `geocode` es `geocodificar` inyectado, para no acoplar este
 * módulo puro al servicio ni a la base de datos en los tests.
 */
export async function geocodificarAnuncios(
  anuncios: AnuncioCrudo[],
  geocode: (consulta: string) => Promise<{ lat: number; lng: number; precision: PrecisionCoordenadas }>,
): Promise<AnuncioCrudo[]> {
  const salida: AnuncioCrudo[] = [];
  for (const a of anuncios) {
    const yaTiene = a.latitud !== null && a.longitud !== null;
    const consulta = [a.direccion, a.municipio, a.provincia].filter(Boolean).join(', ');
    if (yaTiene || !consulta) {
      salida.push(a);
      continue;
    }
    try {
      const g = await geocode(consulta);
      salida.push({ ...a, latitud: g.lat, longitud: g.lng, precision: g.precision });
    } catch {
      salida.push(a);
    }
  }
  return salida;
}
