import type { AnuncioCrudo, TipoInmueble } from '../types/pisos';
import type { CriteriosPortal, OpcionesBusqueda, PortalProvider } from './types';
import { fetchTexto } from './http';
import { extraerJsonLd, primerValor, comoTexto } from './extraer';
import {
  parsearPrecio,
  slugificar,
  esCapitalDeProvincia,
  decodificarEntidades,
  normalizarTexto,
  extraerMetros,
  extraerSuperficieLocal,
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
 * cambia la forma de sus datos, se toca `parsearTarjeta`.
 *
 * Nota (2026-08): el JSON-LD de pisos.com dejó de traer precio, superficie y
 * habitaciones — solo url, título, dirección, geo e imagen. Esos tres datos
 * ahora únicamente están en el marcado de la tarjeta (`.ad-preview__*`), así
 * que aquí SÍ se raspa HTML, al contrario que en Fotocasa. Se compensa
 * leyendo el número limpio de `data-ad-price` en vez del texto "580.000 €", y
 * las coordenadas se siguen tomando del JSON-LD (que sí las conserva),
 * cruzando por `@id`.
 *
 * Verificar con:  npm run smoke -- pisos "Badajoz"
 *                 npm run smoke -- pisos "Badajoz" --tipo local
 *
 * SECCIÓN COMERCIAL SIN VERIFICAR (2026-09): `/venta/locales-<zona>/` está
 * portado de `locales/backend/src/portales/pisoscom.ts` y no se ha comprobado
 * contra el portal en vivo (sí lo está la rareza del `@type`, ver más abajo).
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Segmento de la ruta de pisos.com según el tipo de inmueble. */
const SECCION: Record<TipoInmueble, string> = { vivienda: 'pisos', local: 'locales' };

/** Slugs de URL que en pisos.com son vivienda: si aparecen en un listado de local, se descartan. */
const SLUGS_RESIDENCIALES = ['piso', 'atico', 'duplex', 'chalet', 'vivienda', 'apartamento', 'estudio', 'casa'];

function construirUrl(criterios: CriteriosPortal, pagina: number): string {
  // "pisos-caceres" es la provincia; "pisos-caceres_capital" la ciudad.
  const base = slugificar(criterios.ubicacion);
  const zona = esCapitalDeProvincia(criterios.ubicacion) ? `${base}_capital` : base;
  const seccion = SECCION[criterios.tipo];
  // pisos.com pagina por segmento de ruta, no por query: /venta/pisos-badajoz/2/
  const ruta = pagina <= 1 ? `/venta/${seccion}-${zona}/` : `/venta/${seccion}-${zona}/${pagina}/`;

  const params = new URLSearchParams();
  if (criterios.precioMin !== null) params.set('precioDesde', String(criterios.precioMin));
  if (criterios.precioMax !== null) params.set('precioHasta', String(criterios.precioMax));
  if (criterios.metrosMin !== null) params.set('superficieDesde', String(criterios.metrosMin));
  if (criterios.metrosMax !== null) params.set('superficieHasta', String(criterios.metrosMax));
  // `habitacionesDesde` solo en vivienda: un local no se filtra por habitaciones.
  if (criterios.tipo === 'vivienda' && criterios.habitacionesMin !== null) {
    params.set('habitacionesDesde', String(criterios.habitacionesMin));
  }
  // Orden por más reciente: es toda la premisa de la app.
  params.set('orden', 'relevancia-desc');

  const query = params.toString();
  return `${BASE}${ruta}${query ? `?${query}` : ''}`;
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

interface Geo {
  latitud: number | null;
  longitud: number | null;
  region: string | null;
}

/**
 * Del JSON-LD solo se aprovecha lo que sigue trayendo: coordenadas y región,
 * indexadas por `@id` (el mismo id que la tarjeta lleva en `id="…"`).
 */
function mapaGeoPorId(html: string): Map<string, Geo> {
  const mapa = new Map<string, Geo>();
  // NO se filtra por `@type`: pisos.com etiqueta también los locales como
  // `SingleFamilyResidence` (verificado contra `/venta/locales-madrid/`,
  // 2026-09). Basta con que el objeto tenga `@id` (= id de tarjeta) y `geo`.
  for (const objeto of extraerJsonLd(html)) {
    if (objeto.geo === undefined) continue;
    const id = comoTexto(primerValor(objeto, ['@id', 'identifier', 'sku', 'productID']));
    if (!id) continue;
    mapa.set(id, {
      latitud: numeroONulo(primerValor(objeto, ['geo.latitude'])),
      longitud: numeroONulo(primerValor(objeto, ['geo.longitude'])),
      region:
        decodificarEntidades(
          comoTexto(
            primerValor(objeto, ['address.addressLocality', 'address.addressRegion']),
          ) ?? '',
        ) || null,
    });
  }
  return mapa;
}

function primerGrupo(bloque: string, patron: RegExp): string | null {
  const m = bloque.match(patron);
  return m ? decodificarEntidades(m[1]).replace(/\s+/g, ' ').trim() || null : null;
}

/**
 * Parte el HTML del listado en las tarjetas `<div id="…" class="… ad-preview …">`
 * y saca cada una por separado. Se corta cada bloque en el inicio de la
 * siguiente tarjeta para que un dato de la tarjeta B no se cuele en la A.
 */
function trocearTarjetas(html: string): string[] {
  const inicio = /<div\s+id="(\d+\.\d+)"\s+class="[^"]*\bad-preview\b[^"]*"/g;
  const indices: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = inicio.exec(html)) !== null) indices.push(m.index);

  return indices.map((desde, i) =>
    html.slice(desde, i + 1 < indices.length ? indices[i + 1] : desde + 12_000),
  );
}

/**
 * Expuesto para los tests: parsea una página ya descargada. `tipo` por defecto
 * `vivienda` para no tocar tests ni smoke existentes.
 */
export function parsearPagina(html: string, tipo: TipoInmueble = 'vivienda'): AnuncioCrudo[] {
  const geoPorId = mapaGeoPorId(html);
  const anuncios: AnuncioCrudo[] = [];
  const vistos = new Set<string>();

  for (const bloque of trocearTarjetas(html)) {
    const anuncio = parsearTarjeta(bloque, geoPorId, tipo);
    if (!anuncio || vistos.has(anuncio.portalId)) continue;
    vistos.add(anuncio.portalId);
    anuncios.push(anuncio);
  }
  return anuncios;
}

function parsearTarjeta(
  bloque: string,
  geoPorId: Map<string, Geo>,
  tipo: TipoInmueble,
): AnuncioCrudo | null {
  const id = bloque.match(/^<div\s+id="(\d+\.\d+)"/)?.[1];
  if (!id) return null;

  const urlBruta =
    primerGrupo(bloque, /data-lnk-href="([^"]+)"/) ??
    primerGrupo(bloque, /class="[^"]*\bad-preview__title\b[^"]*"[^>]*href="([^"]+)"/) ??
    primerGrupo(bloque, /href="([^"]+)"[^>]*class="[^"]*\bad-preview__title\b/);
  if (!urlBruta) return null;

  // pisos.com no publica subtipo en la tarjeta: en una búsqueda de local, un
  // anuncio de vivienda que se cuele se descarta por el slug de su URL.
  if (tipo === 'local') {
    const slug = normalizarTexto(urlBruta);
    if (SLUGS_RESIDENCIALES.some((p) => slug.includes(`/${p}-`) || slug.includes(`/${p}s-`))) {
      return null;
    }
  }

  const titulo =
    primerGrupo(bloque, /class="[^"]*\bad-preview__title\b[^"]*"[^>]*>([^<]+)</) ?? '(sin título)';
  const subtitulo = primerGrupo(bloque, /class="[^"]*\bad-preview__subtitle\b[^"]*"[^>]*>([^<]+)</);

  // El número limpio de data-ad-price antes que el texto "580.000 €".
  const precio =
    numeroONulo(primerGrupo(bloque, /data-ad-price="(\d+)"/)) ??
    parsearPrecio(primerGrupo(bloque, /class="[^"]*\bad-preview__price\b[^"]*"[^>]*>([^<]+)</));

  // Cada característica (m², hab, baños) es un <p class="ad-preview__char">.
  const chars = [...bloque.matchAll(/class="[^"]*\bad-preview__char\b[^"]*"[^>]*>([^<]+)</g)].map(
    (m) => decodificarEntidades(m[1]).toLowerCase(),
  );
  // Cada chip de característica se lee por separado y, si el chip concreto no
  // da el dato, se reintenta sobre el texto entero de la tarjeta.
  const chipsTexto = chars.join(' · ');
  const texto = `${titulo} ${subtitulo ?? ''} ${chipsTexto}`;
  const extraerSuperficie = tipo === 'local' ? extraerSuperficieLocal : extraerMetros;
  const metros =
    extraerSuperficie(chars.find((c) => /m²|m2|metro/.test(c)) ?? '') ?? extraerSuperficie(chipsTexto);
  const habitaciones =
    extraerHabitaciones(chars.find((c) => /hab|dormit/.test(c)) ?? '') ??
    extraerHabitaciones(chipsTexto);
  const banos = extraerBanos(chars.find((c) => /ba[ñn]o|aseo/.test(c)) ?? '') ?? extraerBanos(chipsTexto);

  const imagenUrl =
    primerGrupo(bloque, /<img[^>]+src="(https:\/\/fotos\.imghs\.net[^"]+)"/) ??
    primerGrupo(bloque, /<img[^>]+data-src="(https:\/\/fotos\.imghs\.net[^"]+)"/);

  const geo = geoPorId.get(id);

  return {
    tipo,
    portal: PORTAL,
    portalId: id,
    url: absoluta(urlBruta),
    titulo,
    precio,
    metros,
    habitaciones,
    banos,
    planta: extraerPlanta(texto),
    ascensor: tieneAscensor(texto),
    garaje: tieneGaraje(texto),
    terraza: tieneTerraza(texto),
    ubicacion: subtitulo ?? geo?.region ?? null,
    latitud: geo?.latitud ?? null,
    longitud: geo?.longitud ?? null,
    imagenUrl: imagenUrl ? absoluta(imagenUrl) : null,
  };
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
      const anunciosPagina = parsearPagina(html, criterios.tipo);
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
