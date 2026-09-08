import type { AnuncioCrudo } from '../types/locales';
import type { CriteriosPortal, OpcionesBusqueda, PortalProvider } from './types';
import { fetchTexto } from './http';
import { geocodificar } from '../services/geocoding';
import { geocodificarAnuncios, parsearListadoFarmacia } from './comun';

const BASE = 'https://www.tablondeanuncios.com';
const PORTAL = 'tablondeanuncios';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TODO EL CONOCIMIENTO ESPECÍFICO DE Tablón de Anuncios VIVE EN ESTE BLOQUE.
 *
 * SELECTORES SIN VERIFICAR CONTRA EL PORTAL REAL (2026-09) — sin salida a
 * internet en dev. Verificar con `npm run smoke -- tablondeanuncios "Madrid"`.
 *
 * Portal de anuncios clasificados; se busca la sección de venta/traspaso de
 * farmacias. Las fichas son de particular/intermediario: título, precio,
 * provincia y descripción larga con la facturación. Sin dirección exacta lo
 * normal — se geocodifica el municipio si aparece.
 *
 * URL (conjetura): `/farmacias-en-venta/<provincia-slug>/` con paginación
 * `?pagina=N`. Ajustar `inicioTarjeta` si el smoke da cero.
 * ─────────────────────────────────────────────────────────────────────────
 */
const INICIO_TARJETA = /<(?:article|div|li)[^>]*class="[^"]*(?:aditem|anuncio|listado-item|resultado|card)[^"]*"/i;

function construirUrl(criterios: CriteriosPortal, pagina: number): string {
  const zona = criterios.provincia || criterios.municipio || criterios.zonaTexto;
  const slug = zona ? zona.trim().toLowerCase().replace(/\s+/g, '-') : '';
  const ruta = slug ? `/farmacias-en-venta/${slug}/` : '/farmacias-en-venta/';
  const params = new URLSearchParams();
  if (pagina > 1) params.set('pagina', String(pagina));
  const query = params.toString();
  return `${BASE}${ruta}${query ? `?${query}` : ''}`;
}

export function parsearPagina(html: string): AnuncioCrudo[] {
  return parsearListadoFarmacia(html, { portal: PORTAL, base: BASE, inicioTarjeta: INICIO_TARJETA });
}

async function recorrer(criterios: CriteriosPortal, opciones: OpcionesBusqueda): Promise<AnuncioCrudo[]> {
  const maxPaginas = Math.max(1, opciones.maxPaginas ?? 2);
  const anuncios: AnuncioCrudo[] = [];
  const vistos = new Set<string>();

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const html = await fetchTexto(construirUrl(criterios, pagina), {
      portal: PORTAL,
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
  return geocodificarAnuncios(anuncios, geocodificar);
}

export const tablonDeAnunciosProvider: PortalProvider = {
  id: PORTAL,
  nombre: 'Tablón de Anuncios',
  tipo: 'farmacia',

  puedeBuscar() {
    return { ok: true };
  },

  buscar(criterios, opciones: OpcionesBusqueda = {}) {
    return recorrer(criterios, opciones);
  },

  puedeParsearUrl(url) {
    return /(^|\.)tablondeanuncios\.com\//i.test(url);
  },

  async parsearUrl(url, opciones: OpcionesBusqueda = {}) {
    if (!this.puedeParsearUrl(url)) return null;
    const html = await fetchTexto(url, { portal: PORTAL, timeoutMs: opciones.timeoutMs });
    const [anuncio] = await geocodificarAnuncios(parsearPagina(html).slice(0, 1), geocodificar);
    return anuncio ?? null;
  },
};
