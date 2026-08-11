import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authOrGroupToken } from '../middleware/groupToken';
import { simplifyDebts, type Balance } from '../lib/settlement';

interface BalanceRow {
  member_id: string;
  name: string;
  balance: number;
}

export async function balancesRoutes(app: FastifyInstance): Promise<void> {
  // GET /groups/:id/balances — balance neto por miembro (agregación en SQL,
  // no persistido — design.md "Balances y liquidación: calculados en
  // lectura, no persistidos")
  app.get<{ Params: { id: string } }>(
    '/groups/:id/balances',
    { preHandler: authOrGroupToken('id') },
    async (request, reply: FastifyReply) => {
      const { id: groupId } = request.params;
      try {
        const result = await pool.query<BalanceRow>(
          `SELECT gm.id AS member_id, gm.name,
                  COALESCE(paid.total, 0) - COALESCE(owed.total, 0) AS balance
           FROM group_member gm
           LEFT JOIN (
             SELECT payer_member_id AS member_id, SUM(amount) AS total
             FROM expense
             WHERE group_id = $1 AND activo = true
             GROUP BY payer_member_id
           ) paid ON paid.member_id = gm.id
           LEFT JOIN (
             SELECT es.member_id, SUM(es.share_amount) AS total
             FROM expense_split es
             JOIN expense e ON e.id = es.expense_id
             WHERE e.group_id = $1 AND e.activo = true
             GROUP BY es.member_id
           ) owed ON owed.member_id = gm.id
           WHERE gm.group_id = $1 AND gm.activo = true
           ORDER BY gm.name ASC`,
          [groupId],
        );
        return reply.send(
          result.rows.map((r) => ({ memberId: r.member_id, name: r.name, balance: r.balance })),
        );
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // GET /groups/:id/settlement — transferencias sugeridas vía simplifyDebts (lib/settlement.ts)
  app.get<{ Params: { id: string } }>(
    '/groups/:id/settlement',
    { preHandler: authOrGroupToken('id') },
    async (request, reply: FastifyReply) => {
      const { id: groupId } = request.params;
      try {
        const result = await pool.query<BalanceRow>(
          `SELECT gm.id AS member_id, gm.name,
                  COALESCE(paid.total, 0) - COALESCE(owed.total, 0) AS balance
           FROM group_member gm
           LEFT JOIN (
             SELECT payer_member_id AS member_id, SUM(amount) AS total
             FROM expense
             WHERE group_id = $1 AND activo = true
             GROUP BY payer_member_id
           ) paid ON paid.member_id = gm.id
           LEFT JOIN (
             SELECT es.member_id, SUM(es.share_amount) AS total
             FROM expense_split es
             JOIN expense e ON e.id = es.expense_id
             WHERE e.group_id = $1 AND e.activo = true
             GROUP BY es.member_id
           ) owed ON owed.member_id = gm.id
           WHERE gm.group_id = $1 AND gm.activo = true`,
          [groupId],
        );
        const balances: Balance[] = result.rows.map((r) => ({ memberId: r.member_id, amount: r.balance }));
        const nameByMember = new Map(result.rows.map((r) => [r.member_id, r.name]));
        const transfers = simplifyDebts(balances).map((t) => ({
          fromMemberId: t.fromMemberId,
          fromMemberName: nameByMember.get(t.fromMemberId) ?? null,
          toMemberId: t.toMemberId,
          toMemberName: nameByMember.get(t.toMemberId) ?? null,
          amount: t.amount,
        }));
        return reply.send(transfers);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );
}
