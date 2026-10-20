/**
 * Importa los semaforos de una ciudad desde OpenStreetMap (Overpass) y los
 * guarda como cruces + accesos.
 *
 * Es idempotente y NUNCA pisa trabajo tuyo:
 *  - un cruce que ya existe solo actualiza su posicion; el nombre y los
 *    accesos que hayas editado no se tocan;
 *  - los accesos solo se crean para un cruce que no tiene NINGUNO (ni siquiera
 *    borrado), asi que reimportar no resucita uno que descartaste;
 *  - un cruce que desaparece de OSM no se borra.
 */

import { pool } from '../db/pool';
import {
  construirConsultaOverpass,
  derivarCruces,
  type OsmElement,
  type CruceImportado,
} from './osm';

const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const USER_AGENT = process.env.OVERPASS_USER_AGENT || 'calendario-semaforos/1.0 (uso personal)';

export interface ResumenImportacion {
  ciudad: string;
  encontrados: number;
  nuevos: number;
  actualizados: number;
  accesosCreados: number;
  /** Cruces sin ninguna calle de coches asociada: no tienen accesos hasta que los anadas a mano. */
  sinAccesos: number;
}

export async function descargarCruces(ciudad: string): Promise<CruceImportado[]> {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: new URLSearchParams({ data: construirConsultaOverpass(ciudad) }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Overpass respondio ${res.status}`);
  const json = (await res.json()) as { elements?: OsmElement[] };
  return derivarCruces(json.elements ?? []);
}

export async function guardarCruces(ciudad: string, cruces: CruceImportado[]): Promise<ResumenImportacion> {
  const resumen: ResumenImportacion = {
    ciudad,
    encontrados: cruces.length,
    nuevos: 0,
    actualizados: 0,
    accesosCreados: 0,
    sinAccesos: 0,
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const c of cruces) {
      if (c.accesos.length === 0) resumen.sinAccesos++;

      // xmax = 0 solo en una fila recien insertada: distingue alta de actualizacion.
      const up = await client.query<{ id: number; insertado: boolean }>(
        `INSERT INTO cruce (osm_id, ciudad, nombre, lat, lng)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (osm_id) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, updated_at = NOW()
         RETURNING id, (xmax = 0) AS insertado`,
        [c.osm_id, ciudad, c.nombre, c.lat, c.lng],
      );
      const { id, insertado } = up.rows[0];
      if (insertado) resumen.nuevos++;
      else resumen.actualizados++;

      const tiene = await client.query('SELECT 1 FROM acceso WHERE cruce_id = $1 LIMIT 1', [id]);
      if (tiene.rows.length > 0) continue;
      for (const a of c.accesos) {
        await client.query(
          'INSERT INTO acceso (cruce_id, nombre, rumbo_grados) VALUES ($1, $2, $3)',
          [id, a.nombre, a.rumbo_grados],
        );
        resumen.accesosCreados++;
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return resumen;
}

export async function importarCiudad(ciudad: string): Promise<ResumenImportacion> {
  const cruces = await descargarCruces(ciudad);
  if (cruces.length === 0) {
    throw new Error(
      `OSM no devolvio ningun semaforo para "${ciudad}". Comprueba que el nombre coincide exactamente con el del municipio en OpenStreetMap.`,
    );
  }
  return guardarCruces(ciudad, cruces);
}
