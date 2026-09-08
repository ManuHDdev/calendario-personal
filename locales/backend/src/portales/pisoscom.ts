import type { AnuncioCrudo } from '../types/locales';
import type { CriteriosPortal, OpcionesBusqueda, PortalProvider } from './types';
import { fetchTexto } from './http';
import { extraerJsonLd, primerValor, comoTexto } from './extraer';
import {
  parsearPrecio,
  slugificar,
  esCapitalDeProvincia,
  decodificarEntidades,
  extraerSuperficieLocal,
  normalizarTexto,
} from './normalizar';

const BASE = 'https://www.pisos.com';
const PORTAL = 'pisoscom';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TODO EL CONOCIMIENTO ESPECÍFICO DE pisos.com (LOCALES) VIVE EN ESTE BLOQUE.
 *
 * SIN VERIFICAR CONTRA EL PORTAL REAL (2026-09) — sin salida a internet en
 * dev. Portado del rastreador de `pisos` (viviendas) y adaptado a locales.
 * Verificar con `npm run smoke -- pisoscom "<zona>"`.
 *
 * URL de locales en venta (conjetura, análoga a `/venta/pisos-<zona>/`):
 *   `/venta/locales-<zona>/` y `/venta/locales-<zona>/<pagina>/`
 *   zona = slug, o slug + `_capital` para las capitales de provincia.
 *
 * Igual que en viviendas: el JSON-LD ya solo trae geo + dirección; precio y
 * superficie viven en el marcado de la tarjeta `.ad-preview__*`, con entidades
 * HTML sin decodificar. El precio limpio está en `data-ad-price`.
 *
 * VERIFICADO CONTRA EL PORTAL REAL (2026-09, `/venta/locales-madrid/`):
 *  - Cada tarjeta es `<div id="<id>" class="ad-preview ...">` con
 *    `id` en formato `<digitos>.<digitos>` (p. ej. `63367423608.994867`).
 *  - Cada tarjeta lleva SU PROPIO `<script type="application/ld+json">` cuyo
 *    `@id` es EXACTAMENTE ese mismo id de tarjeta. El cruce geo va por ahí.
 *  - El `@type` del JSON-LD es `SingleFamilyResidence` (sí, aunque sea un
 *    local) — por eso `mapaGeoPorId` NO filtra por `@type`: toma cualquier
 *    objeto JSON-LD que tenga `@id` + `geo`.
 * ─────────────────────────────────────────────────────────────────────────
 */
function construirUrl(criterios: CriteriosPortal, pagina: number): string {
  const base = slugificar(criterios.zonaTexto);
  const zona = esCapitalDeProvincia(criterios.zonaTexto) ? `${base}_capital` : base;
  const ruta = pagina <= 1 ? `/venta/locales-${zona}/` : `/venta/locales-${zona}/${pagina}/`;

  const params = new URLSearchParams();
  if (criterios.precioMin !== null) params.set('precioDesde', String(criterios.precioMin));
  if (criterios.precioMax !== null) params.set('precioHasta', String(criterios.precioMax));
  if (criterios.superficieMin !== null) params.set('superficieDesde', String(criterios.superficieMin));
  if (criterios.superficieMax !== null) params.set('superficieHasta', String(criterios.superficieMax));
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

function mapaGeoPorId(html: string): Map<string, Geo> {
  const mapa = new Map<string, Geo>();
  for (const objeto of extraerJsonLd(html)) {
    // pisos.com etiqueta cada anuncio como `SingleFamilyResidence` incluso
    // siendo un local, así que no se filtra por `@type`: basta con que el
    // objeto tenga un `@id` (= id de tarjeta) y un bloque `geo`.
    if (objeto.geo === undefined) continue;
    const id = comoTexto(primerValor(objeto, ['@id', 'identifier', 'sku', 'productID']));
    if (!id) continue;
    mapa.set(id, {
      latitud: numeroONulo(primerValor(objeto, ['geo.latitude'])),
      longitud: numeroONulo(primerValor(objeto, ['geo.longitude'])),
      region:
        decodificarEntidades(
          comoTexto(primerValor(objeto, ['address.addressLocality', 'address.addressRegion'])) ?? '',
        ) || null,
    });
  }
  return mapa;
}

function primerGrupo(bloque: string, patron: RegExp): string | null {
  const m = bloque.match(patron);
  return m ? decodificarEntidades(m[1]).replace(/\s+/g, ' ').trim() || null : null;
}

function trocearTarjetas(html: string): string[] {
  const inicio = /<div\s+id="(\d+\.\d+)"\s+class="[^"]*\bad-preview\b[^"]*"/g;
  const indices: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = inicio.exec(html)) !== null) indices.push(m.index);
  return indices.map((desde, i) => html.slice(desde, i + 1 < indices.length ? indices[i + 1] : desde + 12_000));
}

/** Subtipos que en pisos.com son vivienda y no interesan aquí. */
const RESIDENCIAL = ['piso', 'atico', 'duplex', 'chalet', 'vivienda', 'apartamento', 'estudio', 'casa'];

export function parsearPagina(html: string): AnuncioCrudo[] {
  const geoPorId = mapaGeoPorId(html);
  const anuncios: AnuncioCrudo[] = [];
  const vistos = new Set<string>();

  for (const bloque of trocearTarjetas(html)) {
    const anuncio = parsearTarjeta(bloque, geoPorId);
    if (!anuncio || vistos.has(anuncio.portalId)) continue;
    vistos.add(anuncio.portalId);
    anuncios.push(anuncio);
  }
  return anuncios;
}

function parsearTarjeta(bloque: string, geoPorId: Map<string, Geo>): AnuncioCrudo | null {
  const id = bloque.match(/^<div\s+id="(\d+\.\d+)"/)?.[1];
  if (!id) return null;

  const urlBruta =
    primerGrupo(bloque, /data-lnk-href="([^"]+)"/) ??
    primerGrupo(bloque, /class="[^"]*\bad-preview__title\b[^"]*"[^>]*href="([^"]+)"/) ??
    primerGrupo(bloque, /href="([^"]+)"[^>]*class="[^"]*\bad-preview__title\b/);
  if (!urlBruta) return null;

  // Un anuncio de vivienda que se cuele en el listado de locales se descarta.
  if (RESIDENCIAL.some((p) => normalizarTexto(urlBruta).includes(`/${p}-`) || normalizarTexto(urlBruta).includes(`/${p}s-`))) {
    return null;
  }

  const titulo =
    primerGrupo(bloque, /class="[^"]*\bad-preview__title\b[^"]*"[^>]*>([^<]+)</) ?? 'Local comercial';
  const subtitulo = primerGrupo(bloque, /class="[^"]*\bad-preview__subtitle\b[^"]*"[^>]*>([^<]+)</);

  const precio =
    numeroONulo(primerGrupo(bloque, /data-ad-price="(\d+)"/)) ??
    parsearPrecio(primerGrupo(bloque, /class="[^"]*\bad-preview__price\b[^"]*"[^>]*>([^<]+)</));

  const chars = [...bloque.matchAll(/class="[^"]*\bad-preview__char\b[^"]*"[^>]*>([^<]+)</g)].map((mm) =>
    decodificarEntidades(mm[1]).toLowerCase(),
  );
  const chipsTexto = chars.join(' · ');
  const texto = `${titulo} ${subtitulo ?? ''} ${chipsTexto}`;
  const superficieM2 =
    extraerSuperficieLocal(chars.find((c) => /m²|m2|metro/.test(c)) ?? '') ?? extraerSuperficieLocal(chipsTexto);

  const imagenUrl =
    primerGrupo(bloque, /<img[^>]+src="(https:\/\/fotos\.imghs\.net[^"]+)"/) ??
    primerGrupo(bloque, /<img[^>]+data-src="(https:\/\/fotos\.imghs\.net[^"]+)"/);

  const geo = geoPorId.get(id);

  return {
    tipo: 'local',
    portal: PORTAL,
    portalId: id,
    url: absoluta(urlBruta),
    titulo,
    descripcion: null,
    precio,
    precioAnterior: null,
    superficieM2,
    facturacion: null,
    direccion: subtitulo ?? null,
    municipio: subtitulo ?? geo?.region ?? null,
    provincia: null,
    comunidad: null,
    latitud: geo?.latitud ?? null,
    longitud: geo?.longitud ?? null,
    precision: geo?.latitud != null && geo?.longitud != null ? 'aproximada' : 'desconocida',
    imagenUrl: imagenUrl ? absoluta(imagenUrl) : null,
  };
}

async function recorrer(criterios: CriteriosPortal, opciones: OpcionesBusqueda): Promise<AnuncioCrudo[]> {
  const maxPaginas = Math.max(1, opciones.maxPaginas ?? 2);
  const anuncios: AnuncioCrudo[] = [];
  const vistos = new Set<string>();

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const html = await fetchTexto(construirUrl(criterios, pagina), {
      portal: 'pisos.com',
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
}

export const pisosComProvider: PortalProvider = {
  id: PORTAL,
  nombre: 'pisos.com',
  tipo: 'local',

  puedeBuscar(criterios) {
    return criterios.zonaTexto.trim()
      ? { ok: true }
      : { ok: false, motivo: 'pisos.com necesita una zona con nombre' };
  },

  buscar(criterios, opciones: OpcionesBusqueda = {}) {
    return recorrer(criterios, opciones);
  },

  puedeParsearUrl(url) {
    return /(^|\.)pisos\.com\//i.test(url);
  },

  async parsearUrl(url, opciones: OpcionesBusqueda = {}) {
    if (!this.puedeParsearUrl(url)) return null;
    const html = await fetchTexto(url, { portal: 'pisos.com', timeoutMs: opciones.timeoutMs });
    return parsearPagina(html)[0] ?? null;
  },
};
