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
