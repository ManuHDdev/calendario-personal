import type { AnuncioCrudo } from '../types/pisos';
import type { CriteriosPortal, OpcionesBusqueda, PortalProvider } from './types';
import { fetchTexto } from './http';
import { extraerJsonLd, filtrarPorTipo, primerValor, comoTexto } from './extraer';
import {
  parsearPrecio,
  slugificar,
  decodificarEntidades,
  extraerMetros,
  extraerHabitaciones,
  extraerBanos,
  extraerPlanta,
  tieneAscensor,
  tieneGaraje,
  tieneTerraza,
} from './normalizar';

const BASE = 'https://www.pisos.com';
const PORTAL = 'pisos';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TODO EL CONOCIMIENTO ESPECÍFICO DE pisos.com VIVE EN ESTE BLOQUE.
 *
 * Si el portal cambia su estructura de URL, se toca `construirUrl`; si
 * cambia la forma de sus datos, se toca `parsearTarjeta`.
 *
 * Nota (2026-08): el JSON-LD de pisos.com dejó de traer precio, superficie y
 * habitaciones — solo url, título, dirección, geo e imagen. Esos tres datos
 * ahora únicamente están en el marcado de la tarjeta (`.ad-preview__*`), así
 * que aquí SÍ se raspa HTML, al contrario que en Fotocasa. Se compensa
 * leyendo el número limpio de `data-ad-price` en vez del texto "580.000 €", y
 * las coordenadas se siguen tomando del JSON-LD (que sí las conserva),
 * cruzando por `@id`.
 *
 * Verificar con:  npm run smoke -- pisos "Badajoz"
 * ─────────────────────────────────────────────────────────────────────────
 */
function construirUrl(criterios: CriteriosPortal, pagina: number): string {
  const zona = slugificar(criterios.ubicacion);
  // pisos.com pagina por segmento de ruta, no por query: /venta/pisos-badajoz/2/
  const ruta = pagina <= 1 ? `/venta/pisos-${zona}/` : `/venta/pisos-${zona}/${pagina}/`;

  const params = new URLSearchParams();
  if (criterios.precioMin !== null) params.set('precioDesde', String(criterios.precioMin));
  if (criterios.precioMax !== null) params.set('precioHasta', String(criterios.precioMax));
  if (criterios.metrosMin !== null) params.set('superficieDesde', String(criterios.metrosMin));
  if (criterios.metrosMax !== null) params.set('superficieHasta', String(criterios.metrosMax));
  if (criterios.habitacionesMin !== null) params.set('habitacionesDesde', String(criterios.habitacionesMin));
  // Orden por más reciente: es toda la premisa de la app.
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

/**
 * Del JSON-LD solo se aprovecha lo que sigue trayendo: coordenadas y región,
 * indexadas por `@id` (el mismo id que la tarjeta lleva en `id="…"`).
 */
function mapaGeoPorId(html: string): Map<string, Geo> {
  const mapa = new Map<string, Geo>();
  for (const objeto of filtrarPorTipo(extraerJsonLd(html), [
    'SingleFamilyResidence',
    'Residence',
    'Apartment',
    'House',
    'Product',
  ])) {
    const id = comoTexto(primerValor(objeto, ['@id', 'identifier', 'sku', 'productID']));
    if (!id) continue;
    mapa.set(id, {
      latitud: numeroONulo(primerValor(objeto, ['geo.latitude'])),
      longitud: numeroONulo(primerValor(objeto, ['geo.longitude'])),
      region:
        decodificarEntidades(
          comoTexto(
            primerValor(objeto, ['address.addressLocality', 'address.addressRegion']),
          ) ?? '',
        ) || null,
    });
  }
  return mapa;
}

function primerGrupo(bloque: string, patron: RegExp): string | null {
  const m = bloque.match(patron);
  return m ? decodificarEntidades(m[1]).replace(/\s+/g, ' ').trim() || null : null;
}

/**
 * Parte el HTML del listado en las tarjetas `<div id="…" class="… ad-preview …">`
 * y saca cada una por separado. Se corta cada bloque en el inicio de la
 * siguiente tarjeta para que un dato de la tarjeta B no se cuele en la A.
 */
function trocearTarjetas(html: string): string[] {
  const inicio = /<div\s+id="(\d+\.\d+)"\s+class="[^"]*\bad-preview\b[^"]*"/g;
  const indices: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = inicio.exec(html)) !== null) indices.push(m.index);

  return indices.map((desde, i) =>
    html.slice(desde, i + 1 < indices.length ? indices[i + 1] : desde + 12_000),
  );
}

/** Expuesto para los tests: parsea una página ya descargada. */
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

  const titulo =
    primerGrupo(bloque, /class="[^"]*\bad-preview__title\b[^"]*"[^>]*>([^<]+)</) ?? '(sin título)';
  const subtitulo = primerGrupo(bloque, /class="[^"]*\bad-preview__subtitle\b[^"]*"[^>]*>([^<]+)</);

  // El número limpio de data-ad-price antes que el texto "580.000 €".
  const precio =
    numeroONulo(primerGrupo(bloque, /data-ad-price="(\d+)"/)) ??
    parsearPrecio(primerGrupo(bloque, /class="[^"]*\bad-preview__price\b[^"]*"[^>]*>([^<]+)</));

  // Cada característica (m², hab, baños) es un <p class="ad-preview__char">.
  const chars = [...bloque.matchAll(/class="[^"]*\bad-preview__char\b[^"]*"[^>]*>([^<]+)</g)].map(
    (m) => decodificarEntidades(m[1]).toLowerCase(),
  );
  // Cada chip de característica se lee por separado y, si el chip concreto no
  // da el dato, se reintenta sobre el texto entero de la tarjeta.
  const chipsTexto = chars.join(' · ');
  const texto = `${titulo} ${subtitulo ?? ''} ${chipsTexto}`;
  const metros =
    extraerMetros(chars.find((c) => /m²|m2|metro/.test(c)) ?? '') ?? extraerMetros(chipsTexto);
  const habitaciones =
    extraerHabitaciones(chars.find((c) => /hab|dormit/.test(c)) ?? '') ??
    extraerHabitaciones(chipsTexto);
  const banos = extraerBanos(chars.find((c) => /ba[ñn]o|aseo/.test(c)) ?? '') ?? extraerBanos(chipsTexto);

  const imagenUrl =
    primerGrupo(bloque, /<img[^>]+src="(https:\/\/fotos\.imghs\.net[^"]+)"/) ??
    primerGrupo(bloque, /<img[^>]+data-src="(https:\/\/fotos\.imghs\.net[^"]+)"/);

  const geo = geoPorId.get(id);

  return {
    portal: PORTAL,
    portalId: id,
    url: absoluta(urlBruta),
    titulo,
    precio,
    metros,
    habitaciones,
    banos,
    planta: extraerPlanta(texto),
    ascensor: tieneAscensor(texto),
    garaje: tieneGaraje(texto),
    terraza: tieneTerraza(texto),
    ubicacion: subtitulo ?? geo?.region ?? null,
    latitud: geo?.latitud ?? null,
    longitud: geo?.longitud ?? null,
    imagenUrl: imagenUrl ? absoluta(imagenUrl) : null,
  };
}

export const pisosComProvider: PortalProvider = {
  id: PORTAL,
  nombre: 'pisos.com',

  puedeBuscar(criterios) {
    return criterios.ubicacion.trim()
      ? { ok: true }
      : { ok: false, motivo: 'pisos.com necesita una ubicación con nombre' };
  },

  async buscar(criterios, opciones: OpcionesBusqueda = {}) {
    const maxPaginas = Math.max(1, opciones.maxPaginas ?? 2);
    const anuncios: AnuncioCrudo[] = [];
    const vistos = new Set<string>();

    for (let pagina = 1; pagina <= maxPaginas; pagina++) {
      const html = await fetchTexto(construirUrl(criterios, pagina), {
        portal: 'pisos.com',
        timeoutMs: opciones.timeoutMs,
      });
      const anunciosPagina = parsearPagina(html);
      // Una página sin resultados es el final del listado: seguir pidiendo
      // páginas vacías solo gasta peticiones contra el portal.
      if (anunciosPagina.length === 0) break;

      for (const anuncio of anunciosPagina) {
        if (vistos.has(anuncio.portalId)) continue;
        vistos.add(anuncio.portalId);
        anuncios.push(anuncio);
      }
    }

    return anuncios;
  },
};
