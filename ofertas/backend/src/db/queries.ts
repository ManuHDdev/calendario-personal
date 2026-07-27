export interface SqlQuery {
  text: string;
  values: unknown[];
}

/**
 * Listado admin de búsquedas guardadas. Filtra SIEMPRE por activo = true
 * (regla global del monorepo: los listados nunca muestran borrados lógicos).
 */
export function buildListBusquedasQuery(): SqlQuery {
  return {
    text: `SELECT * FROM busqueda WHERE activo = true ORDER BY nombre`,
    values: [],
  };
}

/**
 * Búsquedas activas consumidas por GET /ofertas/api/searches/active (el
 * scraper externo). Misma condición activo = true que el listado admin,
 * pero se mantiene como función separada porque alimenta el DTO público
 * (ver dto/activeSearch.dto.ts) y puede evolucionar de forma independiente
 * sin afectar al listado del panel admin.
 */
export function buildActiveBusquedasQuery(): SqlQuery {
  return {
    text: `SELECT * FROM busqueda WHERE activo = true ORDER BY nombre`,
    values: [],
  };
}

/**
 * Estado actual del scraper externo (fila única, id=1 de scraper_state).
 * Usada tanto por las rutas admin (GET/PATCH /scraper/state) como por la
 * ruta bearer-token del scraper (GET /scraper/status).
 */
export function buildGetScraperStateQuery(): SqlQuery {
  return {
    text: `SELECT running, updated_at FROM scraper_state WHERE id = 1`,
    values: [],
  };
}

/**
 * Actualiza el on/off del scraper. Solo usada por PATCH /scraper/state
 * (admin, Keycloak) — el scraper externo únicamente lee el estado, nunca lo
 * escribe.
 */
export function buildUpdateScraperStateQuery(running: boolean): SqlQuery {
  return {
    text: `UPDATE scraper_state SET running = $1, updated_at = NOW() WHERE id = 1 RETURNING running, updated_at`,
    values: [running],
  };
}
