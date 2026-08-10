import type { ListItemsQuery } from '../schemas/item.schema';

export interface SqlQuery {
  text: string;
  values: unknown[];
}

/**
 * Construye el listado de items. Filtra SIEMPRE por activo = true (regla
 * global del monorepo: los listados nunca muestran borrados lógicos) y añade
 * condiciones opcionales por tipo/estado.
 */
export function buildListQuery(filters: ListItemsQuery): SqlQuery {
  const conditions: string[] = ['activo = true'];
  const values: unknown[] = [];

  if (filters.tipo) {
    values.push(filters.tipo);
    conditions.push(`tipo = $${values.length}`);
  }
  if (filters.estado) {
    values.push(filters.estado);
    conditions.push(`estado = $${values.length}`);
  }

  return {
    text: `SELECT * FROM item WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
    values,
  };
}
