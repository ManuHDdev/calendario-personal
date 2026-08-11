import { pool } from './pool';
import { isMatchingAccessToken } from '../middleware/groupToken';

export interface SqlQuery {
  text: string;
  values: unknown[];
}

/**
 * Resuelve un `access_token` candidato a un grupo activo, comparando en
 * tiempo constante contra cada `access_token` (mismo patrón que
 * ofertas/SCRAPER_API_KEY, adaptado de "un secreto" a "N secretos, uno por
 * grupo" — ver design.md). El volumen esperado de grupos activos es pequeño
 * (uso personal/familiar), por lo que el escaneo O(n) es aceptable y
 * preferible a filtrar por igualdad directa en SQL, que rompería la garantía
 * de tiempo constante que pide el diseño.
 */
export async function resolveGroupByToken(token: string): Promise<{ id: string; name: string } | null> {
  const result = await pool.query<{ id: string; name: string; access_token: string }>(
    'SELECT id, name, access_token FROM "group" WHERE activo = true',
  );
  for (const row of result.rows) {
    if (isMatchingAccessToken(token, row.access_token)) {
      return { id: row.id, name: row.name };
    }
  }
  return null;
}

/**
 * True si el miembro está referenciado como pagador o participante en algún
 * gasto activo del grupo — bloquea el borrado (spec.md "Member removal
 * blocked while referenced").
 */
export async function memberHasActiveExpenseReferences(groupId: string, memberId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM expense WHERE group_id = $1 AND activo = true AND payer_member_id = $2
     UNION
     SELECT 1 FROM expense_split es
       JOIN expense e ON e.id = es.expense_id
       WHERE e.group_id = $1 AND e.activo = true AND es.member_id = $2
     LIMIT 1`,
    [groupId, memberId],
  );
  return (result.rowCount ?? 0) > 0;
}
