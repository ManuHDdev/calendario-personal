import type { AnuncioCrudo } from '../types/locales';
import type { CriteriosPortal, OpcionesBusqueda, PortalProvider } from './types';
import { fetchTexto } from './http';
import { geocodificar } from '../services/geocoding';
import { geocodificarAnuncios, parsearListadoFarmacia } from './comun';

const BASE = 'https://www.farmaconsulting.es';
const PORTAL = 'farmaconsulting';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TODO EL CONOCIMIENTO ESPECÍFICO DE Farmaconsulting VIVE EN ESTE BLOQUE.
 *
 * SELECTORES SIN VERIFICAR CONTRA EL PORTAL REAL (2026-09) — sin salida a
 * internet en dev. Verificar con `npm run smoke -- farmaconsulting "Madrid"`.
 *
 * Farmaconsulting es una de las dos grandes intermediarias del sector, con un
 * listado público de oportunidades. Cada tarjeta suele dar: una referencia,
 * la facturación aproximada ("V.L. 900.000 €"), la provincia o "zona", y el
 * precio orientativo. Rara vez la dirección exacta — a propósito: la ubican
 * por zona hasta que hay interés. Sin dirección ⇒ sin coordenadas; si la
 * tarjeta nombra un municipio, se geocodifica.
 *
 * URL del listado (conjetura): `/oportunidades/` (o `/farmacias-en-venta/`),
 * con filtro `?provincia=<slug>` y paginación `?pagina=N`. `inicioTarjeta`
 * apunta a un contenedor con "referencia"/"ref" en el class — es lo primero a
 * ajustar si el smoke da cero.
 * ─────────────────────────────────────────────────────────────────────────
 */
const INICIO_TARJETA = /<(?:article|div|li)[^>]*class="[^"]*(?:oportunidad|farmacia|opportunity|card|resultado)[^"]*"/i;

function construirUrl(criterios: CriteriosPortal, pagina: number): string {
  const params = new URLSearchParams();
  const zona = criterios.provincia || criterios.municipio || criterios.zonaTexto;
  if (zona) params.set('provincia', zona);
  if (pagina > 1) params.set('pagina', String(pagina));
  const query = params.toString();
  return `${BASE}/oportunidades/${query ? `?${query}` : ''}`;
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

export const farmaconsultingProvider: PortalProvider = {
  id: PORTAL,
  nombre: 'Farmaconsulting',
  tipo: 'farmacia',

  puedeBuscar() {
    return { ok: true };
  },

  buscar(criterios, opciones: OpcionesBusqueda = {}) {
    return recorrer(criterios, opciones);
  },

  puedeParsearUrl(url) {
    return /(^|\.)farmaconsulting\.es\//i.test(url);
  },

  async parsearUrl(url, opciones: OpcionesBusqueda = {}) {
    if (!this.puedeParsearUrl(url)) return null;
    const html = await fetchTexto(url, { portal: PORTAL, timeoutMs: opciones.timeoutMs });
    const [anuncio] = await geocodificarAnuncios(parsearPagina(html).slice(0, 1), geocodificar);
    return anuncio ?? null;
  },
};
