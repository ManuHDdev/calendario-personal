import type { ListGastosQuery } from '../schemas/gasto.schema';

export interface SqlQuery {
  text: string;
  values: unknown[];
}

/**
 * Construye el listado de gastos. Filtra SIEMPRE por activo = true (regla
 * global del monorepo: los listados nunca muestran borrados lógicos) y añade
 * condiciones opcionales por mes/categoria/estado.
 */
export function buildListQuery(filters: ListGastosQuery): SqlQuery {
  const conditions: string[] = ['activo = true'];
  const values: unknown[] = [];

  if (filters.mes) {
    values.push(`${filters.mes}-01`);
    conditions.push(`date_trunc('month', fecha) = date_trunc('month', $${values.length}::date)`);
  }
  if (filters.categoria) {
    values.push(filters.categoria);
    conditions.push(`categoria = $${values.length}`);
  }
  if (filters.estado) {
    values.push(filters.estado);
    conditions.push(`estado = $${values.length}`);
  }

  // Los previstos se listan por fecha conocida más próxima primero (los sin
  // fecha van al final); cualquier otro filtro (o ninguno) mantiene el orden
  // descendente habitual por fecha.
  const orderBy = filters.estado === 'previsto'
    ? 'fecha ASC NULLS LAST, created_at DESC'
    : 'fecha DESC, created_at DESC';

  return {
    text: `SELECT * FROM gasto WHERE ${conditions.join(' AND ')} ORDER BY ${orderBy}`,
    values,
  };
}

/**
 * Construye la query de totales del mes. SIEMPRE filtra por
 * estado = 'confirmado' (regla de negocio dura: los borradores OCR
 * pendientes de revisión nunca cuentan en los totales — ver spec.md) y por
 * activo = true.
 */
export function buildTotalesQuery(mes: string): SqlQuery {
  return {
    text: `
      SELECT COALESCE(categoria, 'Sin categoría') AS categoria, SUM(importe)::numeric AS total
      FROM gasto
      WHERE activo = true AND estado = 'confirmado' AND date_trunc('month', fecha) = date_trunc('month', $1::date)
      GROUP BY COALESCE(categoria, 'Sin categoría')
      ORDER BY total DESC
    `,
    values: [`${mes}-01`],
  };
}
