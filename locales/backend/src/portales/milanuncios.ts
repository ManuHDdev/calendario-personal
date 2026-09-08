import type { AnuncioCrudo } from '../types/locales';
import type { CriteriosPortal, OpcionesBusqueda, PortalProvider } from './types';
import { fetchTexto } from './http';
import { slugificar } from './normalizar';
import { parsearListadoSSR } from './comun';
import { geocodificar } from '../services/geocoding';

const BASE = 'https://www.milanuncios.com';
const PORTAL = 'milanuncios';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TODO EL CONOCIMIENTO ESPECÍFICO DE milanuncios (LOCALES) VIVE EN ESTE BLOQUE.
 *
 * SIN VERIFICAR CONTRA EL PORTAL REAL (2026-09) — sin salida a internet en
 * dev. Verificar con `npm run smoke -- milanuncios "<zona>" ` (usa el nombre
 * de la provincia como zona).
 *
 * milanuncios NO tiene búsqueda por coordenadas + radio: solo por slug de
 * provincia. Por eso cada anuncio se geocodifica uno a uno con
 * `geocodificar()` (Nominatim, 1 req/s, caché permanente) sobre
 * `direccion + ', ' + municipio` — y de ahí sale también la `precision`. Si no
 * hay ninguna cadena de ubicación, el anuncio se guarda sin coordenadas.
 *
 * URL (conjetura): `/locales-y-negocios-en-<provincia-slug>/venta/` con
 * paginación `?pagina=N`. milanuncios es un Next.js con `__NEXT_DATA__`; los
 * anuncios se localizan por FORMA vía `parsearListadoSSR`.
 *
 * NO RASTREABLE DESDE SERVIDOR (smoke real 2026-09): 404 en todas las rutas
 * probadas (incluidas las de redirección) y anti-bot / JS agresivo.
 * `puedeBuscar` devuelve `{ ok: false }` hasta que haya una solución con
 * navegador headless — igual que Idealista en pisos. El parser se conserva.
 * ─────────────────────────────────────────────────────────────────────────
 */
function zonaSlug(criterios: CriteriosPortal): string | null {
  const zona = criterios.provincia || criterios.municipio || criterios.zonaTexto;
  return zona ? slugificar(zona) : null;
}

function construirUrl(criterios: CriteriosPortal, pagina: number): string {
  const slug = zonaSlug(criterios) ?? 'espana';
  const params = new URLSearchParams();
  if (pagina > 1) params.set('pagina', String(pagina));
  if (criterios.precioMin !== null) params.set('desde', String(criterios.precioMin));
  if (criterios.precioMax !== null) params.set('hasta', String(criterios.precioMax));
  params.set('orden', 'date');
  return `${BASE}/locales-y-negocios-en-${slug}/venta/?${params.toString()}`;
}

const RECHAZAR = ['traspaso', 'alquiler', 'se alquila', 'piso', 'vivienda'];

/** Puro: sin coordenadas todavía (las pone `buscar` vía geocodificación). */
export function parsearPagina(html: string): AnuncioCrudo[] {
  return parsearListadoSSR(html, {
    portal: PORTAL,
    base: BASE,
    tipo: 'local',
    rechazarSi: RECHAZAR,
    jsonLdTipos: ['Product', 'Offer', 'Place', 'Store'],
  });
}

function cadenaUbicacion(a: AnuncioCrudo): string | null {
  const partes = [a.direccion, a.municipio, a.provincia].filter(Boolean);
  return partes.length > 0 ? partes.join(', ') : null;
}

async function geolocalizar(anuncios: AnuncioCrudo[]): Promise<AnuncioCrudo[]> {
  const salida: AnuncioCrudo[] = [];
  for (const a of anuncios) {
    if (a.latitud !== null && a.longitud !== null) {
      salida.push(a);
      continue;
    }
    const consulta = cadenaUbicacion(a);
    if (!consulta) {
      salida.push(a);
      continue;
    }
    try {
      const g = await geocodificar(consulta);
      salida.push({ ...a, latitud: g.lat, longitud: g.lng, precision: g.precision });
    } catch {
      // Sin coordenadas: el anuncio no se pierde, solo se queda sin viabilidad.
      salida.push(a);
    }
  }
  return salida;
}

async function recorrer(criterios: CriteriosPortal, opciones: OpcionesBusqueda): Promise<AnuncioCrudo[]> {
  const maxPaginas = Math.max(1, opciones.maxPaginas ?? 2);
  const anuncios: AnuncioCrudo[] = [];
  const vistos = new Set<string>();

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const html = await fetchTexto(construirUrl(criterios, pagina), {
      portal: 'milanuncios',
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
  return geolocalizar(anuncios);
}

export const milanunciosProvider: PortalProvider = {
  id: PORTAL,
  nombre: 'milanuncios',
  tipo: 'local',

  puedeBuscar() {
    return {
      ok: false,
      motivo:
        'milanuncios no es rastreable desde servidor (bloqueo anti-bot / SPA sin HTML) — pendiente de navegador headless, igual que Idealista',
    };
  },

  buscar(criterios, opciones: OpcionesBusqueda = {}) {
    return recorrer(criterios, opciones);
  },

  puedeParsearUrl(url) {
    return /(^|\.)milanuncios\.com\//i.test(url);
  },

  async parsearUrl(url, opciones: OpcionesBusqueda = {}) {
    if (!this.puedeParsearUrl(url)) return null;
    const html = await fetchTexto(url, { portal: 'milanuncios', timeoutMs: opciones.timeoutMs });
    const [anuncio] = await geolocalizar(parsearPagina(html).slice(0, 1));
    return anuncio ?? null;
  },
};
