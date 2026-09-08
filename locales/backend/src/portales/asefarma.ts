import type { AnuncioCrudo } from '../types/locales';
import type { CriteriosPortal, OpcionesBusqueda, PortalProvider } from './types';
import { fetchTexto } from './http';
import { geocodificar } from '../services/geocoding';
import { geocodificarAnuncios, parsearListadoFarmacia } from './comun';

const BASE = 'https://www.asefarma.com';
const PORTAL = 'asefarma';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TODO EL CONOCIMIENTO ESPECÍFICO DE Asefarma VIVE EN ESTE BLOQUE.
 *
 * SELECTORES SIN VERIFICAR CONTRA EL PORTAL REAL (2026-09) — sin salida a
 * internet en dev. Verificar con `npm run smoke -- asefarma "Madrid"`.
 *
 * Asefarma es la otra gran intermediaria. Su bolsa de farmacias en venta es
 * un listado tipo WordPress: cada entrada trae referencia, facturación
 * ("facturación de X €"), comunidad/provincia y a veces precio. Casi nunca
 * dirección exacta. Sin dirección ⇒ sin coordenadas; con municipio, se
 * geocodifica.
 *
 * URL del listado (conjetura): `/farmacias-en-venta/` con `?provincia=<slug>`
 * y paginación `/page/N/`. Ajustar `inicioTarjeta` si el smoke da cero.
 *
 * NO RASTREABLE DESDE SERVIDOR (smoke real 2026-09): 404 en
 * `/farmacias-en-venta/` y en `/compra-venta-de-farmacias/`; no se consiguió
 * una muestra de HTML. `puedeBuscar` devuelve `{ ok: false }` hasta que haya
 * una solución con navegador headless y una URL confirmada — igual que
 * Idealista en pisos. El parser (`parsearPagina`) se conserva.
 * ─────────────────────────────────────────────────────────────────────────
 */
const INICIO_TARJETA = /<(?:article|div|li)[^>]*class="[^"]*(?:farmacia|listing|post|entry|card)[^"]*"/i;

function construirUrl(criterios: CriteriosPortal, pagina: number): string {
  const zona = criterios.provincia || criterios.municipio || criterios.zonaTexto;
  const ruta = pagina > 1 ? `/farmacias-en-venta/page/${pagina}/` : '/farmacias-en-venta/';
  const params = new URLSearchParams();
  if (zona) params.set('provincia', zona);
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

export const asefarmaProvider: PortalProvider = {
  id: PORTAL,
  nombre: 'Asefarma',
  tipo: 'farmacia',

  puedeBuscar() {
    return {
      ok: false,
      motivo:
        'Asefarma no es rastreable desde servidor (bloqueo anti-bot / SPA sin HTML) — pendiente de navegador headless, igual que Idealista',
    };
  },

  buscar(criterios, opciones: OpcionesBusqueda = {}) {
    return recorrer(criterios, opciones);
  },

  puedeParsearUrl(url) {
    return /(^|\.)asefarma\.com\//i.test(url);
  },

  async parsearUrl(url, opciones: OpcionesBusqueda = {}) {
    if (!this.puedeParsearUrl(url)) return null;
    const html = await fetchTexto(url, { portal: PORTAL, timeoutMs: opciones.timeoutMs });
    const [anuncio] = await geocodificarAnuncios(parsearPagina(html).slice(0, 1), geocodificar);
    return anuncio ?? null;
  },
};
