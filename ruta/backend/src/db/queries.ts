import type {
  SavedRouteSearchCreateData,
  SavedRouteSearchUpdateData,
} from '../types/ruta';

export interface Query {
  text: string;
  values: unknown[];
}

const COLUMNS = `id, nombre, origen_texto, origen_lat, origen_lng,
                 destino_texto, destino_lat, destino_lng, keyword,
                 desvio_max_km, min_price, max_price, excluir_palabras,
                 created_at, updated_at`;

export function listSavedSearches(): Query {
  return {
    text: `SELECT ${COLUMNS}
             FROM busqueda_ruta
            WHERE activo = true
            ORDER BY updated_at DESC`,
    values: [],
  };
}

export function getSavedSearchById(id: number): Query {
  return {
    text: `SELECT ${COLUMNS}
             FROM busqueda_ruta
            WHERE id = $1 AND activo = true`,
    values: [id],
  };
}

export function createSavedSearch(data: SavedRouteSearchCreateData): Query {
  return {
    text: `INSERT INTO busqueda_ruta
             (nombre, origen_texto, origen_lat, origen_lng,
              destino_texto, destino_lat, destino_lng, keyword,
              desvio_max_km, min_price, max_price, excluir_palabras)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING ${COLUMNS}`,
    values: [
      data.nombre,
      data.origen_texto,
      data.origen_lat,
      data.origen_lng,
      data.destino_texto,
      data.destino_lat,
      data.destino_lng,
      data.keyword,
      data.desvio_max_km,
      data.min_price ?? null,
      data.max_price ?? null,
      data.excluir_palabras ?? null,
    ],
  };
}

/**
 * Builds a partial UPDATE from whatever fields were supplied.
 *
 * Column names come from a fixed allowlist rather than the request body, so an
 * unexpected key can never reach the SQL text; every value stays parameterised.
 */
export function updateSavedSearch(id: number, data: SavedRouteSearchUpdateData): Query {
  const allowed: Array<keyof SavedRouteSearchUpdateData> = [
    'nombre',
    'origen_texto',
    'origen_lat',
    'origen_lng',
    'destino_texto',
    'destino_lat',
    'destino_lng',
    'keyword',
    'desvio_max_km',
    'min_price',
    'max_price',
    'excluir_palabras',
  ];

  const assignments: string[] = [];
  const values: unknown[] = [];

  for (const column of allowed) {
    if (data[column] === undefined) continue;
    values.push(data[column]);
    assignments.push(`${column} = $${values.length}`);
  }

  // Belt and braces: the Zod schema already rejects an empty patch, but an
  // empty assignment list would build syntactically invalid SQL.
  if (assignments.length === 0) {
    throw new Error('Se debe enviar al menos un campo a actualizar');
  }

  values.push(id);

  return {
    text: `UPDATE busqueda_ruta
              SET ${assignments.join(', ')}
            WHERE id = $${values.length} AND activo = true
        RETURNING ${COLUMNS}`,
    values,
  };
}

/** Soft delete, per the monorepo-wide rule: never a physical DELETE. */
export function deleteSavedSearch(id: number): Query {
  return {
    text: `UPDATE busqueda_ruta
              SET activo = false, deleted_at = NOW()
            WHERE id = $1 AND activo = true
        RETURNING id`,
    values: [id],
  };
}
