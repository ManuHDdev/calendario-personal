/**
 * Resolución de una consulta puntual a un veredicto.
 *
 * Es lo que comparten la ruta HTTP y el bot de Telegram: los dos aceptan
 * "una dirección o unas coordenadas" y devuelven lo mismo. Tenerlo aquí evita
 * que la app conteste una cosa por la web y otra por el móvil.
 */

import { comprobarPunto } from '../viabilidad';
import { geocodificar } from './geocoding';
import { pool } from '../db/pool';
import type { PuntoConPrecision, ResultadoViabilidad } from '../types/locales';

export interface ConsultaPuntual {
  latitud?: number;
  longitud?: number;
  direccion?: string;
  comunidad?: string;
  provincia?: string;
  municipio?: string;
  comprobarFarmacias?: boolean;
  comprobarCentrosSanitarios?: boolean;
  distanciaFarmaciasM?: number | null;
  distanciaCentrosSanitariosM?: number | null;
}

export interface RespuestaComprobacion {
  punto: PuntoConPrecision & { descripcion: string | null };
  resultado: ResultadoViabilidad;
}

/** Quita acentos y mayúsculas: "Cádiz", "cadiz" y "CADIZ" son la misma. */
function normalizarNombre(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Provincia -> comunidad, para no obligar al usuario a saber nuestros slugs.
 *
 * Son 52 filas fijas, así que se cargan una vez y se comparan en memoria. Se
 * evita así depender de la extensión `unaccent` de Postgres solo para poder
 * escribir "Cadiz" sin tilde.
 */
let provinciasCache: Map<string, string> | null = null;

export async function comunidadDeProvincia(provincia: string): Promise<string | null> {
  if (!provinciasCache) {
    const { rows } = await pool.query<{ nombre: string; comunidad: string }>(
      'SELECT nombre, comunidad FROM provincia',
    );
    provinciasCache = new Map(rows.map((r) => [normalizarNombre(r.nombre), r.comunidad]));
  }
  return provinciasCache.get(normalizarNombre(provincia)) ?? null;
}

/** Solo para tests: olvida las provincias memorizadas. */
export function _resetProvincias(): void {
  provinciasCache = null;
}

export async function resolverConsulta(c: ConsultaPuntual): Promise<RespuestaComprobacion> {
  let punto: PuntoConPrecision;
  let descripcion: string | null = null;

  if (c.latitud !== undefined && c.longitud !== undefined) {
    punto = {
      lat: c.latitud,
      lng: c.longitud,
      // Unas coordenadas dadas a mano (o una ubicación compartida en Telegram)
      // apuntan a un punto concreto: no hay ofuscación de portal de por medio.
      precision: 'exacta',
    };
  } else {
    const g = await geocodificar(c.direccion as string);
    punto = { lat: g.lat, lng: g.lng, precision: g.precision };
    descripcion = g.displayName;
  }

  let comunidad = c.comunidad ?? null;
  if (!comunidad && c.provincia) comunidad = await comunidadDeProvincia(c.provincia);

  const resultado = await comprobarPunto(punto, {
    comunidad,
    provincia: c.provincia ?? null,
    municipio: c.municipio ?? null,
    sobreescritura: {
      comprobarFarmacias: c.comprobarFarmacias,
      comprobarCentrosSanitarios: c.comprobarCentrosSanitarios,
      ...(c.distanciaFarmaciasM !== undefined
        ? { distanciaFarmaciasM: c.distanciaFarmaciasM }
        : {}),
      ...(c.distanciaCentrosSanitariosM !== undefined
        ? { distanciaCentrosSanitariosM: c.distanciaCentrosSanitariosM }
        : {}),
    },
  });

  return { punto: { ...punto, descripcion }, resultado };
}
