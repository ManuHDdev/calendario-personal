import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authOrGroupToken } from '../middleware/groupToken';
import {
  createExpenseSchema,
  updateExpenseSchema,
  isFullSplitReplace,
  type CreateExpenseInput,
} from '../schemas/expense.schema';
import {
  resolveEqualSplit,
  resolveExactSplit,
  resolvePercentageSplit,
  validateExactSplit,
  validatePercentageSplit,
  type ResolvedSplit,
} from '../lib/splits';

interface ExpenseRow {
  id: string;
  group_id: string;
  payer_member_id: string;
  amount: number;
  description: string;
  date: string;
  category: string | null;
  split_type: 'equal' | 'exact' | 'percentage';
  activo: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SplitRow {
  id: string;
  expense_id: string;
  member_id: string;
  share_amount: number;
  share_percentage: number | null;
}

function toExpenseDto(row: ExpenseRow, splits: SplitRow[]) {
  return {
    id: row.id,
    groupId: row.group_id,
    payerMemberId: row.payer_member_id,
    amount: row.amount,
    description: row.description,
    date: row.date,
    category: row.category,
    splitType: row.split_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    splits: splits.map((s) => ({
      memberId: s.member_id,
      shareAmount: s.share_amount,
      sharePercentage: s.share_percentage,
    })),
  };
}

/** Valida y resuelve los splits de un `createExpenseSchema` ya parseado. */
function resolveSplits(input: CreateExpenseInput): { splits: ResolvedSplit[]; error?: string } {
  if (input.splitType === 'equal') {
    return { splits: resolveEqualSplit(input.amount, input.participants) };
  }
  if (input.splitType === 'exact') {
    const validation = validateExactSplit(input.amount, input.participants);
    if (!validation.valid) return { splits: [], error: validation.message };
    return { splits: resolveExactSplit(input.participants) };
  }
  // percentage
  const validation = validatePercentageSplit(input.participants);
  if (!validation.valid) return { splits: [], error: validation.message };
  return { splits: resolvePercentageSplit(input.amount, input.participants) };
}

export async function expensesRoutes(app: FastifyInstance): Promise<void> {
  // POST /groups/:id/expenses
  app.post<{ Params: { id: string } }>(
    '/groups/:id/expenses',
    { preHandler: authOrGroupToken('id') },
    async (request, reply: FastifyReply) => {
      const { id: groupId } = request.params;
      const parsed = createExpenseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
      }

      const { splits, error } = resolveSplits(parsed.data);
      if (error) {
        return reply.code(400).send({ error, statusCode: 400 });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const expenseResult = await client.query<ExpenseRow>(
          `INSERT INTO expense (group_id, payer_member_id, amount, description, date, category, split_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            groupId,
            parsed.data.payerMemberId,
            parsed.data.amount,
            parsed.data.description,
            parsed.data.date,
            parsed.data.category ?? null,
            parsed.data.splitType,
          ],
        );
        const expense = expenseResult.rows[0];

        const splitRows: SplitRow[] = [];
        for (const s of splits) {
          const splitResult = await client.query<SplitRow>(
            `INSERT INTO expense_split (expense_id, member_id, share_amount, share_percentage)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [expense.id, s.memberId, s.shareAmount, s.sharePercentage],
          );
          splitRows.push(splitResult.rows[0]);
        }

        await client.query('COMMIT');
        return reply.code(201).send(toExpenseDto(expense, splitRows));
      } catch (err) {
        await client.query('ROLLBACK');
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      } finally {
        client.release();
      }
    },
  );

  // GET /groups/:id/expenses
  app.get<{ Params: { id: string } }>(
    '/groups/:id/expenses',
    { preHandler: authOrGroupToken('id') },
    async (request, reply: FastifyReply) => {
      const { id: groupId } = request.params;
      try {
        const expensesResult = await pool.query<ExpenseRow>(
          'SELECT * FROM expense WHERE group_id = $1 AND activo = true ORDER BY date DESC, created_at DESC',
          [groupId],
        );
        const expenseIds = expensesResult.rows.map((r) => r.id);
        let splitsByExpense = new Map<string, SplitRow[]>();
        if (expenseIds.length > 0) {
          const splitsResult = await pool.query<SplitRow>(
            'SELECT * FROM expense_split WHERE expense_id = ANY($1::uuid[])',
            [expenseIds],
          );
          splitsByExpense = new Map();
          for (const row of splitsResult.rows) {
            const list = splitsByExpense.get(row.expense_id) ?? [];
            list.push(row);
            splitsByExpense.set(row.expense_id, list);
          }
        }
        return reply.send(
          expensesResult.rows.map((row) => toExpenseDto(row, splitsByExpense.get(row.id) ?? [])),
        );
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // PATCH /groups/:id/expenses/:expenseId
  app.patch<{ Params: { id: string; expenseId: string } }>(
    '/groups/:id/expenses/:expenseId',
    { preHandler: authOrGroupToken('id') },
    async (request, reply: FastifyReply) => {
      const { id: groupId, expenseId } = request.params;
      const parsed = updateExpenseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
      }

      const client = await pool.connect();
      try {
        const existingResult = await client.query<ExpenseRow>(
          'SELECT * FROM expense WHERE id = $1 AND group_id = $2 AND activo = true',
          [expenseId, groupId],
        );
        if (existingResult.rows.length === 0) {
          return reply.code(404).send({ error: 'Gasto no encontrado', statusCode: 404 });
        }
        const existing = existingResult.rows[0];

        await client.query('BEGIN');

        if (isFullSplitReplace(parsed.data)) {
          const { splits, error } = resolveSplits(parsed.data);
          if (error) {
            await client.query('ROLLBACK');
            return reply.code(400).send({ error, statusCode: 400 });
          }

          const updateResult = await client.query<ExpenseRow>(
            `UPDATE expense
             SET payer_member_id = $2, amount = $3, description = $4, date = $5, category = $6, split_type = $7
             WHERE id = $1
             RETURNING *`,
            [
              expenseId,
              parsed.data.payerMemberId,
              parsed.data.amount,
              parsed.data.description,
              parsed.data.date,
              parsed.data.category ?? null,
              parsed.data.splitType,
            ],
          );

          await client.query('DELETE FROM expense_split WHERE expense_id = $1', [expenseId]);
          const splitRows: SplitRow[] = [];
          for (const s of splits) {
            const splitResult = await client.query<SplitRow>(
              `INSERT INTO expense_split (expense_id, member_id, share_amount, share_percentage)
               VALUES ($1, $2, $3, $4)
               RETURNING *`,
              [expenseId, s.memberId, s.shareAmount, s.sharePercentage],
            );
            splitRows.push(splitResult.rows[0]);
          }

          await client.query('COMMIT');
          return reply.send(toExpenseDto(updateResult.rows[0], splitRows));
        }

        // Actualización parcial de campos simples, sin tocar los splits.
        const fields = parsed.data as Record<string, unknown>;
        const columnMap: Record<string, string> = {
          payerMemberId: 'payer_member_id',
          amount: 'amount',
          description: 'description',
          date: 'date',
          category: 'category',
        };
        const setClauses: string[] = [];
        const values: unknown[] = [expenseId];
        for (const [key, value] of Object.entries(fields)) {
          const column = columnMap[key];
          if (!column) continue;
          values.push(value);
          setClauses.push(`${column} = $${values.length}`);
        }

        const updateResult = await client.query<ExpenseRow>(
          `UPDATE expense SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
          values,
        );
        const splitsResult = await client.query<SplitRow>('SELECT * FROM expense_split WHERE expense_id = $1', [
          expenseId,
        ]);

        await client.query('COMMIT');
        return reply.send(toExpenseDto(updateResult.rows[0], splitsResult.rows));
      } catch (err) {
        await client.query('ROLLBACK');
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      } finally {
        client.release();
      }
    },
  );

  // DELETE /groups/:id/expenses/:expenseId — soft delete
  app.delete<{ Params: { id: string; expenseId: string } }>(
    '/groups/:id/expenses/:expenseId',
    { preHandler: authOrGroupToken('id') },
    async (request, reply: FastifyReply) => {
      const { id: groupId, expenseId } = request.params;
      try {
        const result = await pool.query(
          'UPDATE expense SET activo = false, deleted_at = NOW() WHERE id = $1 AND group_id = $2 AND activo = true RETURNING id',
          [expenseId, groupId],
        );
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Gasto no encontrado', statusCode: 404 });
        }
        return reply.code(204).send();
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // GET /groups/:id/categories — autocompletado
  app.get<{ Params: { id: string } }>(
    '/groups/:id/categories',
    { preHandler: authOrGroupToken('id') },
    async (request, reply: FastifyReply) => {
      const { id: groupId } = request.params;
      try {
        const result = await pool.query<{ category: string }>(
          'SELECT DISTINCT category FROM expense WHERE group_id = $1 AND activo = true AND category IS NOT NULL ORDER BY category',
          [groupId],
        );
        return reply.send(result.rows.map((r) => r.category));
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );
}
