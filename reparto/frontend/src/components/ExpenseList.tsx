import { useState } from 'react';
import type { Expense, ExpenseCreateInput, Member } from '../types';
import ExpenseForm from './ExpenseForm';

interface Props {
  expenses: Expense[];
  members: Member[];
  categories: string[];
  canWrite: boolean;
  onUpdate: (expenseId: string, data: ExpenseCreateInput) => Promise<void>;
  onDelete: (expenseId: string) => Promise<void>;
}

function memberName(members: Member[], id: string): string {
  return members.find((m) => m.id === id)?.name ?? '—';
}

export default function ExpenseList({ expenses, members, categories, canWrite, onUpdate, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (expenses.length === 0) {
    return <p className="empty-hint">Todavía no hay gastos en este grupo.</p>;
  }

  return (
    <div className="expense-cards">
      {expenses.map((exp) => (
        <div key={exp.id} className="expense-card">
          {editingId === exp.id ? (
            <ExpenseForm
              members={members}
              categories={categories}
              initial={exp}
              onCancelEdit={() => setEditingId(null)}
              onSubmit={(data) => onUpdate(exp.id, data)}
            />
          ) : (
            <>
              <div className="expense-card-main">
                <div>
                  <p className="expense-card-desc">{exp.description}</p>
                  <p className="expense-card-meta">
                    {exp.date.slice(0, 10)} · Pagó {memberName(members, exp.payerMemberId)}
                    {exp.category ? ` · ${exp.category}` : ''}
                  </p>
                </div>
                <span className="expense-amount">{exp.amount.toFixed(2)} €</span>
              </div>
              <div className="expense-card-splits">
                {exp.splits.map((s) => (
                  <span key={s.memberId} className="split-chip">
                    {memberName(members, s.memberId)}: {s.shareAmount.toFixed(2)} €
                    {s.sharePercentage != null ? ` (${s.sharePercentage.toFixed(1)}%)` : ''}
                  </span>
                ))}
              </div>
              {canWrite && (
                <div className="expense-card-actions">
                  <button className="btn-secondary" onClick={() => setEditingId(exp.id)}>Editar</button>
                  <button className="btn-danger" onClick={() => onDelete(exp.id)}>Eliminar</button>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
