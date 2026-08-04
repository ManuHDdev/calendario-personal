import type { SpotCreateData, SpotUpdateData, ParkingSpotData } from '../types/spot';

export interface SqlQuery {
  text: string;
  values: unknown[];
}

/**
 * Listado publico de spots activos. Filtro opcional por categoria.
 * ORDER BY region, nombre para agrupar visualmente en el mapa.
 */
export function listSpots(categoria?: string): SqlQuery {
  if (categoria) {
    return {
      text: `SELECT * FROM spot WHERE activo = true AND categoria = $1 ORDER BY region, nombre`,
      values: [categoria],
    };
  }
  return {
    text: `SELECT * FROM spot WHERE activo = true ORDER BY region, nombre`,
    values: [],
  };
}

/**
 * Detalle de un spot activo por id.
 */
export function getSpotById(id: number): SqlQuery {
  return {
    text: `SELECT * FROM spot WHERE id = $1 AND activo = true`,
    values: [id],
  };
}

/**
 * Alta de un nuevo spot. RETURNING * para devolver el registro completo.
 */
export function createSpot(data: SpotCreateData): SqlQuery {
  return {
    text: `INSERT INTO spot (nombre, region, provincia, latitud, longitud, imagen_url, descripcion, categoria)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
    values: [
      data.nombre,
      data.region ?? null,
      data.provincia ?? null,
      data.latitud,
      data.longitud,
      data.imagen_url ?? null,
      data.descripcion ?? null,
      data.categoria,
    ],
  };
}

/**
 * Actualizacion parcial de un spot. Construye SET dinamico solo con los
 * campos proporcionados para evitar sobreescribir con null.
 */
export function updateSpot(id: number, data: SpotUpdateData): SqlQuery {
  const allowedFields = ['nombre', 'region', 'provincia', 'latitud', 'longitud', 'imagen_url', 'descripcion', 'categoria'] as const;
  const entries: [string, unknown][] = [];

  for (const field of allowedFields) {
    if (field in data) {
      entries.push([field, data[field as keyof SpotUpdateData] ?? null]);
    }
  }

  if (entries.length === 0) {
    return { text: `SELECT * FROM spot WHERE id = $1 AND activo = true`, values: [id] };
  }

  const setClauses = entries.map(([key], i) => `${key} = $${i + 2}`).join(', ');
  const values: unknown[] = [id, ...entries.map(([, value]) => value)];

  return {
    text: `UPDATE spot SET ${setClauses}, updated_at = NOW() WHERE id = $1 AND activo = true RETURNING *`,
    values,
  };
}

/**
 * Borrado logico: activo=false, deleted_at=now().
 */
export function deleteSpot(id: number): SqlQuery {
  return {
    text: `UPDATE spot SET activo = false, deleted_at = NOW() WHERE id = $1 AND activo = true RETURNING *`,
    values: [id],
  };
}

/**
 * Conteo de spots activos agrupado por categoria.
 */
export function getStats(): SqlQuery {
  return {
    text: `SELECT categoria, COUNT(*)::int AS total FROM spot WHERE activo = true GROUP BY categoria`,
    values: [],
  };
}

/**
 * Regiones distintas con spots activos, ordenadas alfabeticamente.
 */
export function getRegions(): SqlQuery {
  return {
    text: `SELECT DISTINCT region FROM spot WHERE activo = true AND region IS NOT NULL ORDER BY region`,
    values: [],
  };
}

// ─── Parking queries ───────────────────────────────────────────

export function getParkingBySpotId(spotId: number): SqlQuery {
  return {
    text: 'SELECT * FROM parking_spot WHERE spot_id = $1 AND activo = true',
    values: [spotId],
  };
}

export function getParkingBySpotIds(spotIds: number[]): SqlQuery {
  return {
    text: 'SELECT * FROM parking_spot WHERE spot_id = ANY($1) AND activo = true',
    values: [spotIds],
  };
}

export function createParking(spotId: number, data: ParkingSpotData): SqlQuery {
  return {
    text: `INSERT INTO parking_spot (spot_id, latitud, longitud, descripcion)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
    values: [spotId, data.latitud, data.longitud, data.descripcion ?? null],
  };
}

export function updateParking(spotId: number, data: ParkingSpotData): SqlQuery {
  return {
    text: `UPDATE parking_spot SET latitud = $2, longitud = $3, descripcion = $4, updated_at = NOW()
           WHERE spot_id = $1 AND activo = true RETURNING *`,
    values: [spotId, data.latitud, data.longitud, data.descripcion ?? null],
  };
}

export function deleteParking(spotId: number): SqlQuery {
  return {
    text: 'UPDATE parking_spot SET activo = false, deleted_at = NOW() WHERE spot_id = $1 AND activo = true RETURNING *',
    values: [spotId],
  };
}
