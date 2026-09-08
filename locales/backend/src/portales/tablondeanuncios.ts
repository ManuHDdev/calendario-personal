import type { AnuncioCrudo } from '../types/locales';
import type { CriteriosPortal, OpcionesBusqueda, PortalProvider } from './types';
import { fetchTexto } from './http';
import { geocodificar } from '../services/geocoding';
import { geocodificarAnuncios, comunidadDeTexto, PRECISION_SIN_COORDS } from './comun';
import { decodificarEntidades, parsearPrecio, extraerFacturacion, extraerSuperficieLocal } from './normalizar';

const BASE = 'https://www.tablondeanuncios.com';
const PORTAL = 'tablondeanuncios';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TODO EL CONOCIMIENTO ESPECÍFICO DE Tablón de Anuncios VIVE EN ESTE BLOQUE.
 *
 * VERIFICADO CONTRA EL PORTAL REAL (2026-09).
 *
 * URL: `https://www.tablondeanuncios.com/farmacias-venta/` — resultados
 * nacionales de la búsqueda "farmacias venta", ordenados por relevancia.
 * Paginación: `?pagina=N`. No hay filtro de zona en la URL; se filtra después
 * contra el texto de ubicación del anuncio.
 *
 * OJO: el buscador de este portal es MUY laxo — para "farmacias venta"
 * devuelve también relojes, coches y lámparas. El filtro fino (facturación,
 * etc.) del backend descarta casi todo ese ruido; aquí solo se parsea lo que
 * hay.
 *
 * Cada anuncio es `<article class="result-item" id="NNNN">`:
 *   <div class="small-9 cell"><p>  en Sevilla</p></div>          ← ubicación
 *   <h3><a ... class="titleAd" href="…-NNNN.htm">Título</a></h3>
 *   <p class="hide-for-small-only">Descripción…</p>
 *   <p class="medium-2 cell hide-for-small-only ">Precio…</p>     ← "A convenir" o "<strong>2.200€</strong>"
 *
 * Sin dirección exacta ⇒ sin coordenadas; se geocodifica la ubicación de
 * texto si la hay. `extraerFacturacion` sobre título + descripción.
 *
 * Si el smoke da cero: revisar `SEPARADOR_TARJETA` / `RE_URL`.
 * ─────────────────────────────────────────────────────────────────────────
 */
const SEPARADOR_TARJETA = /<article[^>]*class="result-item"[^>]*id="(\d+)"[^>]*>/i;
const RE_URL = /class="titleAd"[^>]*href="(https?:\/\/[^"]+\.htm)"|href="(https?:\/\/[^"]+\.htm)"[^>]*class="titleAd"/i;
const RE_TITULO = /class="titleAd"[^>]*>([^<]+)<\/a>/i;
const RE_UBICACION = /class="small-9 cell">\s*<p>([^<]*)<\/p>/i;
const RE_DESCRIPCION = /<p class="hide-for-small-only">([\s\S]*?)<\/p>/i;
const RE_PRECIO = /class="medium-2 cell[^"]*">([\s\S]*?)<\/p>/i;

function limpiar(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const t = decodificarEntidades(texto.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return t || null;
}

function normalizarUbicacion(bruto: string | null): string | null {
  const t = limpiar(bruto);
  if (!t) return null;
  return t.replace(/^(?:en|varios(?:\s+en)?)\s+/i, '').trim() || null;
}

function construirUrl(pagina: number): string {
  return pagina > 1 ? `${BASE}/farmacias-venta/?pagina=${pagina}` : `${BASE}/farmacias-venta/`;
}

export function parsearPagina(html: string): AnuncioCrudo[] {
  const partes = html.split(new RegExp(SEPARADOR_TARJETA.source, 'i'));
  // split con grupo de captura intercala: [antes, id, cuerpo, id, cuerpo, …]
  const anuncios: AnuncioCrudo[] = [];
  const vistos = new Set<string>();

  for (let i = 1; i + 1 < partes.length; i += 2) {
    const portalId = partes[i];
    const bloque = partes[i + 1];
    if (!portalId || vistos.has(portalId)) continue;

    const urlMatch = bloque.match(RE_URL);
    const url = urlMatch?.[1] ?? urlMatch?.[2];
    if (!url) continue;
    vistos.add(portalId);

    const titulo = limpiar(bloque.match(RE_TITULO)?.[1]) ?? 'Farmacia en venta';
    const ubicacion = normalizarUbicacion(bloque.match(RE_UBICACION)?.[1] ?? null);
    const descripcion = limpiar(bloque.match(RE_DESCRIPCION)?.[1]);
    const precio = parsearPrecio(limpiar(bloque.match(RE_PRECIO)?.[1]));
    const texto = `${titulo} ${descripcion ?? ''}`;

    anuncios.push({
      tipo: 'farmacia',
      portal: PORTAL,
      portalId,
      url,
      titulo,
      descripcion: descripcion ? descripcion.slice(0, 500) : null,
      precio,
      precioAnterior: null,
      superficieM2: extraerSuperficieLocal(texto),
      facturacion: extraerFacturacion(texto),
      direccion: null,
      municipio: ubicacion,
      provincia: ubicacion,
      comunidad: comunidadDeTexto(`${ubicacion ?? ''} ${texto}`),
      latitud: null,
      longitud: null,
      precision: PRECISION_SIN_COORDS,
      imagenUrl: (() => {
        const m = bloque.match(/<img[^>]+(?:data-src|src)="(https?:\/\/[^"]+)"/i);
        const src = m?.[1];
        return src && !/no-image/.test(src) ? src : null;
      })(),
    });
  }
  return anuncios;
}

function coincideZona(a: AnuncioCrudo, criterios: CriteriosPortal): boolean {
  const zona = (criterios.provincia || criterios.municipio || criterios.zonaTexto || '').trim().toLowerCase();
  if (!zona) return true;
  const heno = `${a.municipio ?? ''} ${a.provincia ?? ''} ${a.comunidad ?? ''} ${a.titulo} ${a.descripcion ?? ''}`.toLowerCase();
  return heno.includes(zona) || (comunidadDeTexto(zona) !== null && a.comunidad === comunidadDeTexto(zona));
}

async function recorrer(criterios: CriteriosPortal, opciones: OpcionesBusqueda): Promise<AnuncioCrudo[]> {
  const maxPaginas = Math.max(1, opciones.maxPaginas ?? 2);
  const anuncios: AnuncioCrudo[] = [];
  const vistos = new Set<string>();

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const html = await fetchTexto(construirUrl(pagina), { portal: PORTAL, timeoutMs: opciones.timeoutMs });
    const anunciosPagina = parsearPagina(html);
    if (anunciosPagina.length === 0) break;
    for (const anuncio of anunciosPagina.filter((a) => coincideZona(a, criterios))) {
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
