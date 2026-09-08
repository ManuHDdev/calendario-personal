import type { AnuncioCrudo } from '../types/locales';
import type { CriteriosPortal, OpcionesBusqueda, PortalProvider } from './types';
import { fetchTexto } from './http';
import { slugificar, esCapitalDeProvincia } from './normalizar';
import { parsearListadoSSR } from './comun';

const BASE = 'https://www.habitaclia.com';
const PORTAL = 'habitaclia';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TODO EL CONOCIMIENTO ESPECÍFICO DE habitaclia (LOCALES) VIVE EN ESTE BLOQUE.
 *
 * SIN VERIFICAR CONTRA EL PORTAL REAL (2026-09) — sin salida a internet en
 * dev. Verificar con `npm run smoke -- habitaclia "<zona>"`.
 *
 * habitaclia (grupo Fotocasa/Adevinta) renderiza en servidor y publica
 * JSON-LD de schema.org + un estado embebido de Next. La sección de locales en
 * venta cuelga de una ruta por zona; el candidato es:
 *   `/locales-<zona>.htm`  (paginación `?pagina=N` o segmento `-<n>`)
 * habitaclia usa nombres de zona propios (comarcas catalanas incluidas), así
 * que el slug puede no casar: si el smoke da cero, ese es el primer sitio a
 * mirar.
 *
 * Los anuncios se localizan por FORMA dentro del estado (id + price + surface)
 * vía `parsearListadoSSR`; si no hay estado, se cae al JSON-LD.
 *
 * NO RASTREABLE DESDE SERVIDOR (smoke real 2026-09): 404 en todas las rutas de
 * locales probadas y la home no publica enlaces `<a>` planos a la sección. Es
 * un front tipo SPA que exige JS. `puedeBuscar` devuelve `{ ok: false }` hasta
 * que haya una solución con navegador headless — igual que Idealista en pisos.
 * El parser (`parsearPagina`) se conserva para cuando eso exista.
 * ─────────────────────────────────────────────────────────────────────────
 */
function construirUrl(criterios: CriteriosPortal, pagina: number): string {
  const base = slugificar(criterios.zonaTexto);
  const zona = esCapitalDeProvincia(criterios.zonaTexto) ? `${base}-capital` : base;
  const ruta = pagina <= 1 ? `/locales-${zona}.htm` : `/locales-${zona}-${pagina}.htm`;

  const params = new URLSearchParams();
  if (criterios.precioMin !== null) params.set('preciomin', String(criterios.precioMin));
  if (criterios.precioMax !== null) params.set('preciomax', String(criterios.precioMax));
  if (criterios.superficieMin !== null) params.set('superficiemin', String(criterios.superficieMin));

  const query = params.toString();
  return `${BASE}${ruta}${query ? `?${query}` : ''}`;
}

const RECHAZAR = ['piso', 'vivienda', 'atico', 'casa', 'chalet', 'apartamento', 'alquiler'];

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
      portal: 'habitaclia',
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

export const habitacliaProvider: PortalProvider = {
  id: PORTAL,
  nombre: 'habitaclia',
  tipo: 'local',

  puedeBuscar() {
    return {
      ok: false,
      motivo:
        'habitaclia no es rastreable desde servidor (bloqueo anti-bot / SPA sin HTML) — pendiente de navegador headless, igual que Idealista',
    };
  },

  buscar(criterios, opciones: OpcionesBusqueda = {}) {
    return recorrer(criterios, opciones);
  },

  puedeParsearUrl(url) {
    return /(^|\.)habitaclia\.com\//i.test(url);
  },

  async parsearUrl(url, opciones: OpcionesBusqueda = {}) {
    if (!this.puedeParsearUrl(url)) return null;
    const html = await fetchTexto(url, { portal: 'habitaclia', timeoutMs: opciones.timeoutMs });
    return parsearPagina(html)[0] ?? null;
  },
};
