/**
 * Importador del registro oficial de oficinas de farmacia de la Comunidad de
 * Madrid (portal de datos abiertos, conjunto `oficinas_farmacia`).
 *
 * Es la fuente de MÁXIMA confianza para Madrid: es el registro administrativo
 * del que salen las autorizaciones, así que gana sobre OSM en la fusión.
 *
 * ADVERTENCIA HONESTA SOBRE ESTE FICHERO
 * --------------------------------------
 * Se ha escrito SIN poder ver el CSV real: el entorno donde se programó tiene
 * el egreso de red bloqueado y no se pudo descargar. Por eso:
 *
 *   - Los nombres de columna se buscan por una lista de alias plausibles en
 *     vez de fijarse a uno concreto.
 *   - Si no encuentra las columnas mínimas, NO adivina: falla con la cabecera
 *     real impresa, que es lo que hace falta para arreglarlo en un minuto.
 *   - Si el CSV no trae coordenadas, geocodifica la dirección con Nominatim.
 *
 * La primera vez que se ejecute con red hay que mirar el log. Si dice que ha
 * importado 0 farmacias o que no encuentra columnas, ajusta los alias de abajo
 * — es el único sitio a tocar.
 */

import { campo, numero, parsearCsv } from '../csv';
import type { PrecisionCoordenadas } from '../../types/locales';

export const URL_DATASET_MADRID =
  process.env.LOCALES_DATASET_MADRID ||
  'https://datos.comunidad.madrid/dataset/2d682b1d-e2e8-4c6f-b902-7a3f108e2fb9/resource/904a161b-f339-4296-be61-1ae914494c89/download/oficinas_farmacia.csv';

export class ImportadorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportadorError';
  }
}

export interface FarmaciaOficial {
  fuenteId: string;
  nombre: string | null;
  direccion: string | null;
  municipio: string | null;
  lat: number | null;
  lng: number | null;
  precision: PrecisionCoordenadas;
  /** Dirección completa para geocodificar si no hay coordenadas. */
  consultaGeocodificacion: string | null;
}

/** Alias por los que puede aparecer cada dato. Este es el sitio a tocar. */
const ALIAS = {
  id: ['codigo', 'id', 'nregistro', 'numeroregistro', 'codigofarmacia', 'cod'],
  nombre: ['nombre', 'denominacion', 'rotulo', 'titular', 'nombrefarmacia'],
  via: ['direccion', 'domicilio', 'via', 'nombrevia', 'calle', 'direccioncompleta'],
  numero: ['numero', 'num', 'nvia', 'numerovia', 'portal'],
  municipio: ['municipio', 'localidad', 'poblacion', 'nombremunicipio'],
  cp: ['codigopostal', 'cp', 'codpostal'],
  lat: ['latitud', 'lat', 'ycoord', 'coordenaday', 'ycoordinate'],
  lng: ['longitud', 'lon', 'lng', 'xcoord', 'coordenadax', 'xcoordinate'],
};

/**
 * Convierte el CSV en registros.
 *
 * Separado de la descarga para poder testearlo contra fixtures sin red.
 */
export function parsearDatasetMadrid(csv: string): FarmaciaOficial[] {
  const { cabeceras, filas } = parsearCsv(csv);
  if (filas.length === 0) {
    throw new ImportadorError('El CSV de la Comunidad de Madrid no tiene filas.');
  }

  const primera = filas[0];
  const tieneVia = campo(primera, ...ALIAS.via) !== null;
  const tieneCoords =
    campo(primera, ...ALIAS.lat) !== null && campo(primera, ...ALIAS.lng) !== null;

  // Sin dirección NI coordenadas no hay nada que ubicar, y seguir importando
  // llenaría el padrón de filas inútiles que además inflarían la cobertura.
  if (!tieneVia && !tieneCoords) {
    throw new ImportadorError(
      'No se reconocen las columnas del CSV de farmacias de Madrid. ' +
        `Cabeceras reales: ${cabeceras.join(' | ')}. ` +
        'Ajusta ALIAS en src/padron/oficial/madrid.ts.',
    );
  }

  return filas.map((fila, i): FarmaciaOficial => {
    const via = campo(fila, ...ALIAS.via);
    const num = campo(fila, ...ALIAS.numero);
    const municipio = campo(fila, ...ALIAS.municipio);
    const cp = campo(fila, ...ALIAS.cp);
    const lat = numero(campo(fila, ...ALIAS.lat));
    const lng = numero(campo(fila, ...ALIAS.lng));

    const direccion = via ? (num ? `${via}, ${num}` : via) : null;

    // El id del registro oficial; si el CSV no trae uno, la posición de la
    // fila es un mal id (cambia al reordenar el fichero), así que se compone
    // con la dirección, que sí es estable.
    const idBruto = campo(fila, ...ALIAS.id);
    const fuenteId =
      idBruto ??
      (direccion
        ? `${direccion}|${municipio ?? ''}`.slice(0, 180)
        : // Último recurso: la posición de la fila. Es un id malo (cambia si
          // reordenan el fichero), pero es mejor que colisionar todas las
          // filas sin dirección en la misma clave y perderlas en el UPSERT.
          `fila-${i}`);

    const coordsValidas =
      lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
      !(lat === 0 && lng === 0);

    return {
      fuenteId,
      nombre: campo(fila, ...ALIAS.nombre),
      direccion,
      municipio,
      lat: coordsValidas ? lat : null,
      lng: coordsValidas ? lng : null,
      // El registro oficial da la dirección con número: geocodificada o
      // publicada, apunta al portal concreto.
      precision: coordsValidas || direccion !== null ? 'exacta' : 'desconocida',
      consultaGeocodificacion: direccion
        ? [direccion, cp, municipio ?? 'Madrid', 'España'].filter(Boolean).join(', ')
        : null,
    };
  });
}

export async function descargarDatasetMadrid(timeoutMs = 120_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(URL_DATASET_MADRID, {
      signal: controller.signal,
      headers: { 'User-Agent': 'ElBunkerDelIngeniero-Locales/1.0' },
    });
    if (!res.ok) {
      throw new ImportadorError(
        `El portal de datos abiertos de Madrid respondió ${res.status}. ` +
          'Comprueba la URL del recurso (LOCALES_DATASET_MADRID).',
      );
    }
    // El portal sirve el CSV en latin1 con frecuencia; se detecta por la
    // presencia del carácter de reemplazo tras decodificar como UTF-8.
    const bytes = Buffer.from(await res.arrayBuffer());
    const comoUtf8 = bytes.toString('utf-8');
    return comoUtf8.includes('�') ? bytes.toString('latin1') : comoUtf8;
  } catch (err) {
    if (err instanceof ImportadorError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ImportadorError('El portal de datos abiertos de Madrid no respondió a tiempo');
    }
    throw new ImportadorError(
      `No se pudo descargar el dataset de Madrid: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
