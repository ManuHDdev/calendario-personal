import type { AnuncioCrudo } from '../types/locales';
import type { CriteriosPortal, OpcionesBusqueda, PortalProvider } from './types';
import { fetchTexto } from './http';
import { slugificar } from './normalizar';
import { geocodificar } from '../services/geocoding';
import { geocodificarAnuncios, parsearListadoFarmacia } from './comun';

const BASE = 'https://www.milanuncios.com';
const PORTAL = 'milanuncios-farmacias';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TODO EL CONOCIMIENTO ESPECÍFICO DE milanuncios (FARMACIAS) VIVE EN ESTE
 * BLOQUE. Es un portal SEPARADO del de locales (`milanuncios.ts`): distinta
 * sección, distinto id (`milanuncios-farmacias`) y sus anuncios se guardan sin
 * mezclarse.
 *
 * SIN VERIFICAR CONTRA EL PORTAL REAL (2026-09) — sin salida a internet en
 * dev. Verificar con `npm run smoke -- milanuncios-farmacias "Madrid"`.
 *
 * milanuncios no busca por coordenadas: por slug de provincia. Cada anuncio de
 * "traspaso de farmacia" trae precio de traspaso, provincia y descripción
 * libre con la facturación. Se geocodifica el municipio si aparece.
 *
 * URL (conjetura): `/traspasos-farmacia-en-<provincia-slug>/` con paginación
 * `?pagina=N`.
 *
 * NO RASTREABLE DESDE SERVIDOR (smoke real 2026-09): 404, mismo bloqueo
 * anti-bot que el milanuncios de locales. `puedeBuscar` devuelve
 * `{ ok: false }` hasta que haya una solución con navegador headless — igual
 * que Idealista en pisos. El parser se conserva.
 * ─────────────────────────────────────────────────────────────────────────
 */
const INICIO_TARJETA = /<(?:article|div)[^>]*class="[^"]*(?:ma-AdCard|aditem|ma-AdvertCard)[^"]*"/i;

function zonaSlug(criterios: CriteriosPortal): string | null {
  const zona = criterios.provincia || criterios.municipio || criterios.zonaTexto;
  return zona ? slugificar(zona) : null;
}

function construirUrl(criterios: CriteriosPortal, pagina: number): string {
  const slug = zonaSlug(criterios) ?? 'espana';
  const params = new URLSearchParams();
  if (pagina > 1) params.set('pagina', String(pagina));
  params.set('orden', 'date');
  return `${BASE}/traspasos-farmacia-en-${slug}/?${params.toString()}`;
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

export const milanunciosFarmaciasProvider: PortalProvider = {
  id: PORTAL,
  nombre: 'milanuncios (farmacias)',
  tipo: 'farmacia',

  puedeBuscar() {
    return {
      ok: false,
      motivo:
        'milanuncios (farmacias) no es rastreable desde servidor (bloqueo anti-bot / SPA sin HTML) — pendiente de navegador headless, igual que Idealista',
    };
  },

  buscar(criterios, opciones: OpcionesBusqueda = {}) {
    return recorrer(criterios, opciones);
  },

  puedeParsearUrl(url) {
    return /(^|\.)milanuncios\.com\/.*(farmacia|traspaso)/i.test(url);
  },

  async parsearUrl(url, opciones: OpcionesBusqueda = {}) {
    if (!this.puedeParsearUrl(url)) return null;
    const html = await fetchTexto(url, { portal: PORTAL, timeoutMs: opciones.timeoutMs });
    const [anuncio] = await geocodificarAnuncios(parsearPagina(html).slice(0, 1), geocodificar);
    return anuncio ?? null;
  },
};
