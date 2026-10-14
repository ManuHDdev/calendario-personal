import type { ListGastosQuery, TotalesQuery } from '../schemas/gasto.schema';

export interface SqlQuery {
  text: string;
  values: unknown[];
}

/**
 * Construye el listado de gastos. Filtra SIEMPRE por activo = true (regla
 * global del monorepo: los listados nunca muestran borrados lógicos) y añade
 * condiciones opcionales por mes/anio/categoria/estado/tipo.
 */
export function buildListQuery(filters: ListGastosQuery): SqlQuery {
  const conditions: string[] = ['activo = true'];
  const values: unknown[] = [];

  if (filters.mes) {
    values.push(`${filters.mes}-01`);
    conditions.push(`date_trunc('month', fecha) = date_trunc('month', $${values.length}::date)`);
  }
  if (filters.anio) {
    // Rango semiabierto en vez de date_trunc/extract sobre la columna, para
    // poder usar idx_gasto_fecha.
    const [desde, hasta] = anioRange(filters.anio);
    values.push(desde, hasta);
    conditions.push(`fecha >= $${values.length - 1}::date AND fecha < $${values.length}::date`);
  }
  if (filters.categoria) {
    values.push(filters.categoria);
    conditions.push(`categoria = $${values.length}`);
  }
  if (filters.estado) {
    values.push(filters.estado);
    conditions.push(`estado = $${values.length}`);
  }
  if (filters.tipo) {
    values.push(filters.tipo);
    conditions.push(`tipo = $${values.length}`);
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

/** `[YYYY-01-01, (YYYY+1)-01-01)` — límites del rango semiabierto de un año. */
export function anioRange(anio: string): [string, string] {
  const y = Number(anio);
  return [`${anio}-01-01`, `${String(y + 1).padStart(4, '0')}-01-01`];
}

/** `[YYYY-MM-01, primer día del mes siguiente)`. */
export function mesRange(mes: string): [string, string] {
  const [y, m] = mes.split('-').map(Number);
  const next = m === 12 ? [y + 1, 1] : [y, m + 1];
  return [`${mes}-01`, `${String(next[0]).padStart(4, '0')}-${String(next[1]).padStart(2, '0')}-01`];
}

function periodoRange(periodo: Pick<TotalesQuery, 'mes' | 'anio'>): [string, string] {
  if (periodo.mes) return mesRange(periodo.mes);
  if (periodo.anio) return anioRange(periodo.anio);
  throw new Error('Periodo requerido: mes o anio');
}

/**
 * Totales confirmados del periodo (mes o año), por tipo y categoría.
 * SIEMPRE filtra por estado = 'confirmado' (regla de negocio dura: los
 * borradores OCR y los previstos nunca cuentan en los totales — ver spec.md)
 * y por activo = true. `categoria` opcional restringe a una sola categoría.
 */
export function buildTotalesQuery(periodo: Pick<TotalesQuery, 'mes' | 'anio' | 'categoria'>): SqlQuery {
  const [desde, hasta] = periodoRange(periodo);
  const values: unknown[] = [desde, hasta];
  let categoriaCond = '';
  if (periodo.categoria) {
    values.push(periodo.categoria);
    categoriaCond = ` AND categoria = $${values.length}`;
  }
  return {
    text: `
      SELECT tipo, COALESCE(categoria, 'Sin categoría') AS categoria, SUM(importe)::numeric AS total
      FROM gasto
      WHERE activo = true AND estado = 'confirmado' AND fecha >= $1::date AND fecha < $2::date${categoriaCond}
      GROUP BY tipo, COALESCE(categoria, 'Sin categoría')
      ORDER BY total DESC, categoria ASC
    `,
    values,
  };
}

/**
 * Totales confirmados de un año agregados por mes y tipo. Mismas reglas
 * duras que buildTotalesQuery. Solo devuelve meses con movimientos; el
 * relleno a 12 meses se hace al montar la respuesta.
 */
export function buildTotalesPorMesQuery(anio: string, categoria?: string): SqlQuery {
  const [desde, hasta] = anioRange(anio);
  const values: unknown[] = [desde, hasta];
  let categoriaCond = '';
  if (categoria) {
    values.push(categoria);
    categoriaCond = ` AND categoria = $${values.length}`;
  }
  return {
    text: `
      SELECT to_char(fecha, 'YYYY-MM') AS mes, tipo, SUM(importe)::numeric AS total
      FROM gasto
      WHERE activo = true AND estado = 'confirmado' AND fecha >= $1::date AND fecha < $2::date${categoriaCond}
      GROUP BY to_char(fecha, 'YYYY-MM'), tipo
      ORDER BY mes ASC
    `,
    values,
  };
}

export type CampoSugerencia = 'categoria' | 'comercio';

// El nombre de columna se interpola en el SQL, así que SOLO puede salir de
// esta lista cerrada, nunca de la petición.
const CAMPOS_SUGERENCIA: Record<CampoSugerencia, string> = {
  categoria: 'categoria',
  comercio: 'comercio',
};

/**
 * Valores distintos usados por movimientos activos (categoría o comercio),
 * ordenados por número de usos descendente y luego alfabéticamente;
 * `tipo` opcional restringe a gastos o ganancias.
 */
export function buildSugerenciasQuery(campo: CampoSugerencia, tipo?: 'gasto' | 'ganancia'): SqlQuery {
  if (!Object.hasOwn(CAMPOS_SUGERENCIA, campo)) {
    throw new Error(`Campo de sugerencia no permitido: ${String(campo)}`);
  }
  const columna = CAMPOS_SUGERENCIA[campo];
  const values: unknown[] = [];
  let tipoCond = '';
  if (tipo) {
    values.push(tipo);
    tipoCond = ` AND tipo = $${values.length}`;
  }
  return {
    text: `
      SELECT ${columna} AS valor, COUNT(*) AS usos
      FROM gasto
      WHERE activo = true AND ${columna} IS NOT NULL AND btrim(${columna}) <> ''${tipoCond}
      GROUP BY ${columna}
      ORDER BY usos DESC, ${columna} ASC
    `,
    values,
  };
}
