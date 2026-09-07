/**
 * Importador de OpenStreetMap vía Overpass.
 *
 * Es la capa NACIONAL y uniforme del padrón: no todas las comunidades publican
 * su registro de farmacias en abierto, y el interés declarado abarca media
 * España. Donde sí hay dato oficial, este se superpone y gana en la fusión
 * (ver `fusion.ts`).
 *
 * De aquí salen tres cosas, en tres consultas por comunidad:
 *   1. farmacias            (`amenity=pharmacy`)
 *   2. centros sanitarios   (`amenity=clinic|doctors|hospital`, `healthcare=centre`)
 *   3. población municipal  (relaciones `admin_level=8` con etiqueta `population`)
 *
 * La tercera puede sorprender, pero es imprescindible: la cobertura del padrón
 * se valida contra el módulo poblacional (~1 farmacia por cada 2.800
 * habitantes), y sin población no hay cota de cordura contra la que comparar.
 * Sacarla de la misma fuente evita añadir una dependencia más, y donde OSM no
 * la tenga la cobertura quedará "desconocida", que degrada a ámbar — la
 * dirección segura del error.
 */

import type { PrecisionCoordenadas } from '../types/locales';

const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';

/** Overpass es un servicio compartido y donado: se le pide despacio. */
const PAUSA_ENTRE_CONSULTAS_MS = 5_000;

/**
 * Código ISO 3166-2 de cada comunidad, que es como Overpass identifica sus
 * áreas administrativas. Las claves son las mismas que usa `normativa.comunidad`.
 */
export const ISO_POR_COMUNIDAD: Record<string, string> = {
  andalucia: 'ES-AN',
  aragon: 'ES-AR',
  asturias: 'ES-AS',
  baleares: 'ES-IB',
  canarias: 'ES-CN',
  cantabria: 'ES-CB',
  'castilla-leon': 'ES-CL',
  'castilla-mancha': 'ES-CM',
  cataluna: 'ES-CT',
  ceuta: 'ES-CE',
  extremadura: 'ES-EX',
  galicia: 'ES-GA',
  madrid: 'ES-MD',
  melilla: 'ES-ML',
  murcia: 'ES-MC',
  navarra: 'ES-NC',
  'pais-vasco': 'ES-PV',
  rioja: 'ES-RI',
  valenciana: 'ES-VC',
};

export class OverpassError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverpassError';
  }
}

interface ElementoOverpass {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

export interface EstablecimientoOsm {
  fuenteId: string;
  nombre: string | null;
  direccion: string | null;
  municipio: string | null;
  lat: number;
  lng: number;
  precision: PrecisionCoordenadas;
  /** Solo para centros sanitarios. */
  tipo?: 'primaria' | 'especializada' | 'hospital';
}

export interface PoblacionOsm {
  municipio: string;
  poblacion: number;
}

async function consultar(ql: string, timeoutMs = 240_000): Promise<ElementoOverpass[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // Overpass pide identificarse, igual que Nominatim en `ruta`.
        'User-Agent': 'ElBunkerDelIngeniero-Locales/1.0 (https://elbunkerdelingeniero.duckdns.org/locales/)',
      },
      body: new URLSearchParams({ data: ql }).toString(),
    });

    if (res.status === 429 || res.status === 504) {
      throw new OverpassError(
        `Overpass está saturado (${res.status}). Reintenta más tarde o usa otra instancia con OVERPASS_URL.`,
      );
    }
    if (!res.ok) throw new OverpassError(`Overpass respondió ${res.status}`);

    const body = (await res.json()) as { elements?: unknown };
    if (!Array.isArray(body.elements)) {
      throw new OverpassError('Overpass devolvió una respuesta sin elementos');
    }
    return body.elements as ElementoOverpass[];
  } catch (err) {
    if (err instanceof OverpassError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new OverpassError(`Overpass no respondió en ${timeoutMs / 1000} s`);
    }
    throw new OverpassError(
      `Fallo consultando Overpass: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function coordenadasDe(e: ElementoOverpass): { lat: number; lng: number } | null {
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  return { lat, lng: lon };
}

/**
 * Precisión de una coordenada de OSM.
 *
 * Un nodo con número de portal está mapeado sobre el edificio: vale para
 * decidir a 250 m. Un polígono sin dirección puede ser el contorno de un
 * centro comercial entero, y su centroide estar a bastantes metros de la
 * puerta real de la farmacia.
 */
function precisionDe(e: ElementoOverpass): PrecisionCoordenadas {
  const t = e.tags ?? {};
  if (e.type === 'node' && t['addr:housenumber']) return 'exacta';
  if (e.type === 'node') return 'aproximada';
  return 'aproximada';
}

function direccionDe(tags: Record<string, string>): string | null {
  const via = tags['addr:street'];
  const num = tags['addr:housenumber'];
  if (via && num) return `${via}, ${num}`;
  return via ?? null;
}

function aEstablecimiento(e: ElementoOverpass): EstablecimientoOsm | null {
  const coords = coordenadasDe(e);
  if (!coords) return null;
  const tags = e.tags ?? {};
  return {
    fuenteId: `${e.type}/${e.id}`,
    nombre: tags.name ?? null,
    direccion: direccionDe(tags),
    municipio: tags['addr:city'] ?? null,
    lat: coords.lat,
    lng: coords.lng,
    precision: precisionDe(e),
  };
}

function areaDe(comunidad: string): string {
  const iso = ISO_POR_COMUNIDAD[comunidad];
  if (!iso) {
    throw new OverpassError(
      `No hay código ISO para la comunidad "${comunidad}"; añádelo a ISO_POR_COMUNIDAD.`,
    );
  }
  return `area["ISO3166-2"="${iso}"][admin_level=4]->.a;`;
}

export async function farmaciasDeComunidad(comunidad: string): Promise<EstablecimientoOsm[]> {
  const ql = `[out:json][timeout:240];
${areaDe(comunidad)}
(
  node["amenity"="pharmacy"](area.a);
  way["amenity"="pharmacy"](area.a);
  relation["amenity"="pharmacy"](area.a);
);
out center tags;`;
  const elementos = await consultar(ql);
  return elementos.map(aEstablecimiento).filter((e): e is EstablecimientoOsm => e !== null);
}

/** Un centro sanitario siempre trae `tipo`; una farmacia nunca. */
export type CentroOsm = EstablecimientoOsm & { tipo: NonNullable<EstablecimientoOsm['tipo']> };

export async function centrosDeComunidad(comunidad: string): Promise<CentroOsm[]> {
  const ql = `[out:json][timeout:240];
${areaDe(comunidad)}
(
  nwr["amenity"="clinic"](area.a);
  nwr["amenity"="doctors"](area.a);
  nwr["amenity"="hospital"](area.a);
  nwr["healthcare"="centre"](area.a);
);
out center tags;`;
  const elementos = await consultar(ql);
  return elementos
    .map((e): CentroOsm | null => {
      const base = aEstablecimiento(e);
      if (!base) return null;
      const t = e.tags ?? {};
      const tipo: CentroOsm['tipo'] =
        t.amenity === 'hospital'
          ? 'hospital'
          : t.amenity === 'clinic'
            ? 'especializada'
            : 'primaria';
      return { ...base, tipo };
    })
    .filter((e): e is CentroOsm => e !== null);
}

/**
 * Población por municipio, de las relaciones administrativas de nivel 8.
 *
 * OSM no la tiene para todos los municipios; los que falten quedan sin
 * población y su cobertura será "desconocida", que degrada a ámbar.
 */
export async function poblacionesDeComunidad(comunidad: string): Promise<PoblacionOsm[]> {
  const ql = `[out:json][timeout:240];
${areaDe(comunidad)}
relation["admin_level"="8"]["boundary"="administrative"]["population"](area.a);
out tags;`;
  const elementos = await consultar(ql);
  const salida: PoblacionOsm[] = [];
  for (const e of elementos) {
    const nombre = e.tags?.name;
    const bruto = e.tags?.population;
    if (!nombre || !bruto) continue;
    // La etiqueta a veces trae separadores de miles o notas.
    const poblacion = parseInt(bruto.replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(poblacion) && poblacion > 0) salida.push({ municipio: nombre, poblacion });
  }
  return salida;
}

/** Pausa entre consultas, por respeto a la cuota de la instancia pública. */
export function esperarEntreConsultas(): Promise<void> {
  return new Promise((r) => setTimeout(r, PAUSA_ENTRE_CONSULTAS_MS));
}
