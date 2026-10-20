import type { CamaraRow, CamaraResponseDTO } from '../types/camara';
import type { CamaraDgt } from '../services/dgtParser';
import { ciudadPorSlug } from '../services/ciudades';

export const COLUMNAS_CAMARA = `id, origen, external_id, nombre, carretera, ciudad, latitud, longitud,
  distancia_km, url_imagen, url_pagina, fuente, favorita, visto_en`;

/** Fila de BD → CamaraResponseDTO. */
export function aDto(row: CamaraRow): CamaraResponseDTO {
  return {
    id: row.id,
    origen: row.origen,
    nombre: row.nombre,
    carretera: row.carretera,
    ciudad: row.ciudad,
    latitud: row.latitud,
    longitud: row.longitud,
    distanciaKm: row.distancia_km === null ? null : Math.round(row.distancia_km * 10) / 10,
    tieneImagen: row.url_imagen !== null,
    urlPagina: row.url_pagina,
    fuente: row.origen === 'dgt' ? 'DGT' : (row.fuente ?? 'Manual'),
    favorita: row.favorita,
    vistoEn: row.visto_en ? row.visto_en.toISOString() : null,
  };
}

export interface FiltrosListado {
  ciudad?: string;
  favorita?: 'true' | 'false';
}

/** Listado: SIEMPRE `activo = true` y sin las que ya no aparecen en el feed de la DGT. */
export function construirListadoQuery(filtros: FiltrosListado): { text: string; values: unknown[] } {
  const condiciones = ['activo = true', 'retirada = false'];
  const values: unknown[] = [];

  if (filtros.ciudad) {
    values.push(filtros.ciudad);
    condiciones.push(`ciudad = $${values.length}`);
  }
  if (filtros.favorita) {
    values.push(filtros.favorita === 'true');
    condiciones.push(`favorita = $${values.length}`);
  }
  return {
    text: `SELECT ${COLUMNAS_CAMARA} FROM camara
           WHERE ${condiciones.join(' AND ')}
           ORDER BY ciudad, distancia_km NULLS FIRST, nombre`,
    values,
  };
}

/**
 * Upsert de una cámara de la DGT. `ON CONFLICT` actualiza los datos que vienen
 * del feed y marca la cámara como vista, pero NO toca `favorita` ni `activo`:
 * una cámara que el propietario borró a mano no debe resucitar en la siguiente
 * importación, y su favorita debe sobrevivir.
 */
export function construirUpsertCamaraDgtQuery(
  camara: CamaraDgt,
  ciudad: string,
  distanciaKm: number,
): { text: string; values: unknown[] } {
  if (!ciudadPorSlug(ciudad)) throw new Error(`Ciudad desconocida: ${ciudad}`);
  return {
    text: `INSERT INTO camara (origen, external_id, nombre, carretera, ciudad, latitud, longitud, distancia_km, url_imagen, visto_en, retirada)
           VALUES ('dgt', $1, $2, $3, $4, $5, $6, $7, $8, NOW(), false)
           ON CONFLICT (origen, external_id) WHERE external_id IS NOT NULL
           DO UPDATE SET nombre = EXCLUDED.nombre, carretera = EXCLUDED.carretera, ciudad = EXCLUDED.ciudad,
                         latitud = EXCLUDED.latitud, longitud = EXCLUDED.longitud, distancia_km = EXCLUDED.distancia_km,
                         url_imagen = EXCLUDED.url_imagen, visto_en = NOW(), retirada = false, updated_at = NOW()`,
    values: [camara.externalId, camara.nombre, camara.carretera, ciudad, camara.latitud, camara.longitud, distanciaKm, camara.urlImagen],
  };
}
