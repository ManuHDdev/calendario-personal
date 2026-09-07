/**
 * Texto libre -> coordenadas, vía Nominatim (OpenStreetMap).
 *
 * Adaptado del cliente de `ruta`, con la misma disciplina: una petición por
 * segundo como máximo, User-Agent identificativo, y caché permanente en
 * Postgres para que una dirección solo se resuelva una vez.
 *
 * La diferencia con el de `ruta` es que aquí importa CUÁNTO vale la coordenada
 * devuelta, no solo cuál es. Nominatim puede resolver "Calle Mayor, Madrid"
 * al centro de la calle entera —cientos de metros de largo— y eso no sirve
 * para decidir a 250 m. Por eso se guarda y se propaga la precisión.
 */

import { pool } from '../db/pool';
import type { PrecisionCoordenadas } from '../types/locales';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ||
  'ElBunkerDelIngeniero-Locales/1.0 (https://elbunkerdelingeniero.duckdns.org/locales/)';

export class GeocodingError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 502,
  ) {
    super(message);
    this.name = 'GeocodingError';
  }
}

export interface ResultadoGeocode {
  lat: number;
  lng: number;
  displayName: string;
  precision: PrecisionCoordenadas;
}

const INTERVALO_MINIMO_MS = 1100;
let ultimaPeticion = 0;
let cadena: Promise<unknown> = Promise.resolve();

function normalizar(consulta: string): string {
  return consulta.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Traduce el `place_rank` de Nominatim a nuestra escala de precisión.
 *
 * Nominatim usa 30 para portal/edificio, 26-27 para viales, y menos para
 * entidades mayores. Solo el nivel de portal permite decidir a 250 m; un vial
 * puede medir medio kilómetro y su punto central no dice gran cosa.
 */
export function precisionDeRank(
  placeRank: number | null,
  tipoDireccion: string | null,
): PrecisionCoordenadas {
  if (tipoDireccion === 'building' || tipoDireccion === 'house') return 'exacta';
  if (placeRank !== null && placeRank >= 30) return 'exacta';
  if (placeRank !== null && placeRank >= 20) return 'aproximada';
  return 'desconocida';
}

async function leerCache(clave: string): Promise<ResultadoGeocode | null> {
  const { rows } = await pool.query<{
    latitud: string;
    longitud: string;
    display_name: string;
    precision_coordenadas: PrecisionCoordenadas;
  }>(
    'SELECT latitud, longitud, display_name, precision_coordenadas FROM geocode_cache WHERE consulta = $1',
    [clave],
  );
  const f = rows[0];
  if (!f) return null;
  return {
    lat: Number(f.latitud),
    lng: Number(f.longitud),
    displayName: f.display_name,
    precision: f.precision_coordenadas,
  };
}

async function escribirCache(clave: string, v: ResultadoGeocode): Promise<void> {
  await pool.query(
    `INSERT INTO geocode_cache (consulta, latitud, longitud, display_name, precision_coordenadas)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (consulta) DO UPDATE
       SET latitud = EXCLUDED.latitud,
           longitud = EXCLUDED.longitud,
           display_name = EXCLUDED.display_name,
           precision_coordenadas = EXCLUDED.precision_coordenadas`,
    [clave, v.lat, v.lng, v.displayName, v.precision],
  );
}

export async function geocodificar(consulta: string): Promise<ResultadoGeocode> {
  const clave = normalizar(consulta);
  if (!clave) throw new GeocodingError('La dirección está vacía', 400);

  const cacheado = await leerCache(clave).catch(() => null);
  if (cacheado) return cacheado;

  const trabajo = cadena.then(async () => {
    const espera = INTERVALO_MINIMO_MS - (Date.now() - ultimaPeticion);
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    ultimaPeticion = Date.now();
    return pedirANominatim(clave);
  });
  // La cadena sobrevive a un fallo: una consulta mala no debe atascar el resto.
  cadena = trabajo.catch(() => undefined);

  const resuelto = await trabajo;
  await escribirCache(clave, resuelto).catch(() => undefined);
  return resuelto;
}

async function pedirANominatim(consulta: string, timeoutMs = 15_000): Promise<ResultadoGeocode> {
  const params = new URLSearchParams({
    q: consulta,
    format: 'jsonv2',
    limit: '1',
    addressdetails: '0',
    countrycodes: 'es',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Accept-Language': 'es' },
    });
    if (!res.ok) throw new GeocodingError(`El geocodificador respondió ${res.status}`);

    const body = (await res.json()) as Array<{
      lat?: unknown;
      lon?: unknown;
      display_name?: unknown;
      place_rank?: unknown;
      addresstype?: unknown;
    }>;

    const hit = Array.isArray(body) ? body[0] : undefined;
    const lat = hit ? Number(hit.lat) : NaN;
    const lng = hit ? Number(hit.lon) : NaN;

    if (!hit || Number.isNaN(lat) || Number.isNaN(lng)) {
      throw new GeocodingError(`No se encontró ninguna dirección para "${consulta}"`, 404);
    }

    return {
      lat,
      lng,
      displayName: typeof hit.display_name === 'string' ? hit.display_name : consulta,
      precision: precisionDeRank(
        typeof hit.place_rank === 'number' ? hit.place_rank : null,
        typeof hit.addresstype === 'string' ? hit.addresstype : null,
      ),
    };
  } catch (err) {
    if (err instanceof GeocodingError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new GeocodingError(`El geocodificador no respondió en ${timeoutMs} ms`);
    }
    throw new GeocodingError(
      `Falló la geocodificación: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
