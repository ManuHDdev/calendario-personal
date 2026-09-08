import type { AnuncioCrudo } from '../types/locales';
import type { CriteriosPortal, OpcionesBusqueda, PortalProvider } from './types';
import { fetchTexto } from './http';
import { slugificar, esCapitalDeProvincia } from './normalizar';
import { parsearListadoSSR } from './comun';

const BASE = 'https://www.yaencontre.com';
const PORTAL = 'yaencontre';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TODO EL CONOCIMIENTO ESPECÍFICO DE yaencontre (LOCALES) VIVE EN ESTE BLOQUE.
 *
 * SIN VERIFICAR CONTRA EL PORTAL REAL (2026-09) — sin salida a internet en
 * dev. Verificar con `npm run smoke -- yaencontre "<zona>"`.
 *
 * yaencontre es un Next.js: deja `__NEXT_DATA__` con el listado y además
 * JSON-LD. La sección de locales en venta (conjetura) cuelga de:
 *   `/locales-comerciales/venta/<zona>`  con paginación `?pagina=N`
 * El slug de zona es el habitual (provincia o municipio). Los anuncios se
 * localizan por FORMA dentro de `__NEXT_DATA__` (id + price + surface) vía
 * `parsearListadoSSR`; si no hay estado, se cae al JSON-LD.
 * ─────────────────────────────────────────────────────────────────────────
 */
function construirUrl(criterios: CriteriosPortal, pagina: number): string {
  const base = slugificar(criterios.zonaTexto);
  const zona = esCapitalDeProvincia(criterios.zonaTexto) ? `${base}-capital` : base;
  const ruta = `/locales-comerciales/venta/${zona}`;

  const params = new URLSearchParams();
  if (pagina > 1) params.set('pagina', String(pagina));
  if (criterios.precioMin !== null) params.set('precioMin', String(criterios.precioMin));
  if (criterios.precioMax !== null) params.set('precioMax', String(criterios.precioMax));
  if (criterios.superficieMin !== null) params.set('superficieMin', String(criterios.superficieMin));

  const query = params.toString();
  return `${BASE}${ruta}${query ? `?${query}` : ''}`;
}

const RECHAZAR = ['piso', 'vivienda', 'atico', 'casa', 'chalet', 'apartamento', 'alquiler', 'obra nueva'];

export function parsearPagina(html: string): AnuncioCrudo[] {
  return parsearListadoSSR(html, {
    portal: PORTAL,
    base: BASE,
    tipo: 'local',
    rechazarSi: RECHAZAR,
    jsonLdTipos: ['Product', 'RealEstateListing', 'Place', 'Store', 'Offer', 'LocalBusiness'],
  });
}

async function recorrer(criterios: CriteriosPortal, opciones: OpcionesBusqueda): Promise<AnuncioCrudo[]> {
  const maxPaginas = Math.max(1, opciones.maxPaginas ?? 2);
  const anuncios: AnuncioCrudo[] = [];
  const vistos = new Set<string>();

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const html = await fetchTexto(construirUrl(criterios, pagina), {
      portal: 'yaencontre',
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

export const yaencontreProvider: PortalProvider = {
  id: PORTAL,
  nombre: 'yaencontre',
  tipo: 'local',

  puedeBuscar(criterios) {
    return criterios.zonaTexto.trim()
      ? { ok: true }
      : { ok: false, motivo: 'yaencontre necesita una zona con nombre' };
  },

  buscar(criterios, opciones: OpcionesBusqueda = {}) {
    return recorrer(criterios, opciones);
  },

  puedeParsearUrl(url) {
    return /(^|\.)yaencontre\.com\//i.test(url);
  },

  async parsearUrl(url, opciones: OpcionesBusqueda = {}) {
    if (!this.puedeParsearUrl(url)) return null;
    const html = await fetchTexto(url, { portal: 'yaencontre', timeoutMs: opciones.timeoutMs });
    return parsearPagina(html)[0] ?? null;
  },
};
