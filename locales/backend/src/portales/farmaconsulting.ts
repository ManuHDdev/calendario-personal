import type { AnuncioCrudo } from '../types/locales';
import type { CriteriosPortal, OpcionesBusqueda, PortalProvider } from './types';
import { fetchTexto } from './http';
import { geocodificar } from '../services/geocoding';
import { geocodificarAnuncios, comunidadDeTexto, PRECISION_SIN_COORDS } from './comun';
import { decodificarEntidades } from './normalizar';

const BASE = 'https://www.farmaconsulting.es';
const PORTAL = 'farmaconsulting';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TODO EL CONOCIMIENTO ESPECÍFICO DE Farmaconsulting VIVE EN ESTE BLOQUE.
 *
 * VERIFICADO CONTRA EL PORTAL REAL (2026-09).
 *
 * URL: `https://www.farmaconsulting.es/farmacias-en-venta/` — es UN listado
 * nacional único, sin filtro de zona en la URL. `puedeBuscar` siempre devuelve
 * ok; el filtro por provincia se hace después, contra el texto del anuncio.
 * No hay paginación real (todas las oportunidades caben en la misma página).
 *
 * Cada oportunidad es un `<div class="bloqueFarmaciaVenta">`:
 *   <p class="provincia"><a ...>ISLAS BALEARES</a></p>   ← comunidad/región
 *   <h4><a ...>Título (truncado con «…»)</a></h4>
 *   <p>Descripción corta (truncada)</p>
 *   <p><a ...>&gt; CCL-17.1_12802</a></p>                ← código de operación
 * y, en el `<div class="opcs">` hermano que va justo después:
 *   onclick="jQuery('#redirection').val(
 *     '/farmacias-en-venta/farmacia-detalle/?farmacia=8575&operacion=CCL-17.1_12802');"
 *
 * NO publica facturación, precio ni superficie en el listado (hay que
 * registrarse para verlo) ⇒ esos campos van a `null`. Tampoco coordenadas: se
 * geocodifica la región (`provincia`), que es lo único que da — es una
 * ubicación deliberadamente difusa, así que `precision: 'desconocida'` incluso
 * tras geocodificar por región.
 *
 * Si el smoke da cero: revisar `SEPARADOR_TARJETA` / `RE_OPERACION`.
 * ─────────────────────────────────────────────────────────────────────────
 */
const SEPARADOR_TARJETA = 'class="bloqueFarmaciaVenta"';
const RE_OPERACION = /farmacia=(\d+)&(?:amp;)?operacion=(CCL-[0-9.]+_[0-9]+)/i;
const RE_REF_TEXTO = /(CCL-[0-9.]+_[0-9]+)/i;
const RE_PROVINCIA = /class="provincia">\s*<a[^>]*>([^<]+)<\/a>/i;
const RE_TITULO = /<h4>\s*<a[^>]*>([^<]+)<\/a>/i;
const RE_DESCRIPCION = /<\/h4>\s*<p>([^<]+)<\/p>/i;

function limpiar(texto: string | null): string | null {
  if (!texto) return null;
  const t = decodificarEntidades(texto).replace(/\s+/g, ' ').replace(/[.…\s]+$/, '').trim();
  return t || null;
}

function construirUrl(): string {
  return `${BASE}/farmacias-en-venta/`;
}

export function parsearPagina(html: string): AnuncioCrudo[] {
  const trozos = html.split(SEPARADOR_TARJETA).slice(1);
  const anuncios: AnuncioCrudo[] = [];
  const vistos = new Set<string>();

  for (const trozo of trozos) {
    const op = trozo.match(RE_OPERACION);
    const ref = op?.[2] ?? trozo.match(RE_REF_TEXTO)?.[1] ?? null;
    if (!ref) continue;
    const portalId = ref.toUpperCase();
    if (vistos.has(portalId)) continue;
    vistos.add(portalId);

    const url = op
      ? `${BASE}/farmacias-en-venta/farmacia-detalle/?farmacia=${op[1]}&operacion=${op[2]}`
      : `${BASE}/farmacias-en-venta/`;

    const region = limpiar(trozo.match(RE_PROVINCIA)?.[1] ?? null);
    const titulo = limpiar(trozo.match(RE_TITULO)?.[1] ?? null) ?? 'Farmacia en venta';
    const descripcion = limpiar(trozo.match(RE_DESCRIPCION)?.[1] ?? null);

    anuncios.push({
      tipo: 'farmacia',
      portal: PORTAL,
      portalId,
      url,
      titulo,
      descripcion,
      precio: null,
      precioAnterior: null,
      superficieM2: null,
      facturacion: null,
      direccion: null,
      municipio: null,
      provincia: region,
      comunidad: comunidadDeTexto(region),
      latitud: null,
      longitud: null,
      precision: PRECISION_SIN_COORDS,
      imagenUrl: null,
    });
  }
  return anuncios;
}

function coincideZona(a: AnuncioCrudo, criterios: CriteriosPortal): boolean {
  const zona = (criterios.provincia || criterios.municipio || criterios.zonaTexto || '').trim().toLowerCase();
  if (!zona) return true;
  const heno = `${a.provincia ?? ''} ${a.comunidad ?? ''} ${a.titulo} ${a.descripcion ?? ''}`.toLowerCase();
  return heno.includes(zona) || (comunidadDeTexto(zona) !== null && a.comunidad === comunidadDeTexto(zona));
}

async function recorrer(criterios: CriteriosPortal, opciones: OpcionesBusqueda): Promise<AnuncioCrudo[]> {
  const html = await fetchTexto(construirUrl(), { portal: PORTAL, timeoutMs: opciones.timeoutMs });
  const anuncios = parsearPagina(html).filter((a) => coincideZona(a, criterios));
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
