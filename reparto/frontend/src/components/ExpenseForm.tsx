import { useState, useEffect, type FormEvent } from 'react';
import type { Expense, ExpenseCreateInput, Member, SplitType } from '../types';

interface Props {
  members: Member[];
  categories: string[];
  onSubmit: (data: ExpenseCreateInput) => Promise<void>;
  /** Presente en modo edición — precarga los campos y el reparto existente. */
  initial?: Expense;
  onCancelEdit?: () => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const CENTS_TOLERANCE = 0.01;

/**
 * Alta/edición de gasto con selector de `splitType` y UI de reparto por
 * participante (tasks.md 7.4): checkboxes para `equal`, importes con total
 * en vivo para `exact`, porcentajes con total en vivo para `percentage`.
 * Valida en cliente antes de enviar, pero el backend es la fuente de verdad
 * (spec.md "Expense split — exact/percentage") — cualquier 400 suyo se
 * muestra tal cual.
 */
export default function ExpenseForm({ members, categories, onSubmit, initial, onCancelEdit }: Props) {
  const [payerMemberId, setPayerMemberId] = useState(initial?.payerMemberId ?? members[0]?.id ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [date, setDate] = useState(initial?.date?.slice(0, 10) ?? todayISO());
  const [category, setCategory] = useState(initial?.category ?? '');
  const [splitType, setSplitType] = useState<SplitType>(initial?.splitType ?? 'equal');

  const [selected, setSelected] = useState<Set<string>>(
    new Set(initial ? initial.splits.map((s) => s.memberId) : members.map((m) => m.id)),
  );
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>(
    Object.fromEntries((initial?.splits ?? []).map((s) => [s.memberId, String(s.shareAmount)])),
  );
  const [percentages, setPercentages] = useState<Record<string, string>>(
    Object.fromEntries(
      (initial?.splits ?? [])
        .filter((s) => s.sharePercentage != null)
        .map((s) => [s.memberId, String(s.sharePercentage)]),
    ),
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!payerMemberId && members[0]) setPayerMemberId(members[0].id);
  }, [members, payerMemberId]);

  const toggleSelected = (memberId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const allSelected = members.length > 0 && members.every((m) => selected.has(m.id));
  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(members.map((m) => m.id)));
  };

  const amountValue = parseFloat(amount.replace(',', '.'));

  const exactTotal = members
    .filter((m) => selected.has(m.id))
    .reduce((sum, m) => sum + (parseFloat((exactAmounts[m.id] ?? '').replace(',', '.')) || 0), 0);

  const percentageTotal = members
    .filter((m) => selected.has(m.id))
    .reduce((sum, m) => sum + (parseFloat((percentages[m.id] ?? '').replace(',', '.')) || 0), 0);

  const resetForm = () => {
    setPayerMemberId(members[0]?.id ?? '');
    setAmount('');
    setDescription('');
    setDate(todayISO());
    setCategory('');
    setSplitType('equal');
    setSelected(new Set(members.map((m) => m.id)));
    setExactAmounts({});
    setPercentages({});
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError('Introduce un importe válido');
      return;
    }
    if (!payerMemberId) {
      setError('Selecciona quién ha pagado');
      return;
    }
    if (!description.trim()) {
      setError('La descripción es obligatoria');
      return;
    }
    const participantIds = members.filter((m) => selected.has(m.id)).map((m) => m.id);
    if (participantIds.length === 0) {
      setError('Selecciona al menos un participante');
      return;
    }

    let data: ExpenseCreateInput;
    if (splitType === 'equal') {
      data = {
        payerMemberId, amount: amountValue, description: description.trim(), date,
        category: category.trim() || undefined, splitType: 'equal',
        participants: participantIds.map((memberId) => ({ memberId })),
      };
    } else if (splitType === 'exact') {
      if (Math.abs(exactTotal - amountValue) > CENTS_TOLERANCE) {
        setError(`La suma de los importes (${exactTotal.toFixed(2)} €) no coincide con el total (${amountValue.toFixed(2)} €)`);
        return;
      }
      data = {
        payerMemberId, amount: amountValue, description: description.trim(), date,
        category: category.trim() || undefined, splitType: 'exact',
        participants: participantIds.map((memberId) => ({
          memberId, shareAmount: parseFloat((exactAmounts[memberId] ?? '0').replace(',', '.')) || 0,
        })),
      };
    } else {
      if (Math.abs(percentageTotal - 100) > CENTS_TOLERANCE) {
        setError(`La suma de los porcentajes (${percentageTotal.toFixed(2)}%) debe ser 100%`);
        return;
      }
      data = {
        payerMemberId, amount: amountValue, description: description.trim(), date,
        category: category.trim() || undefined, splitType: 'percentage',
        participants: participantIds.map((memberId) => ({
          memberId, sharePercentage: parseFloat((percentages[memberId] ?? '0').replace(',', '.')) || 0,
        })),
      };
    }

    setSaving(true);
    try {
      await onSubmit(data);
      if (!initial) resetForm();
      else onCancelEdit?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el gasto');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="expense-form" onSubmit={handleSubmit}>
      <div className="expense-form-row">
        <input
          type="number" step="0.01" min="0" placeholder="Importe (€)"
          value={amount} onChange={(e) => setAmount(e.target.value)} required
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="expense-form-row">
        <input
          type="text" placeholder="Descripción (p. ej. Cena del viernes)"
          value={description} onChange={(e) => setDescription(e.target.value)} required
        />
        <input
          type="text" placeholder="Categoría (opcional)" list="categorias-list"
          value={category} onChange={(e) => setCategory(e.target.value)}
        />
        <datalist id="categorias-list">
          {categories.map((c) => <option key={c} value={c} />)}
        </datalist>
      </div>
      <div className="expense-form-row">
        <select value={payerMemberId} onChange={(e) => setPayerMemberId(e.target.value)} required>
          <option value="" disabled>¿Quién pagó?</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={splitType} onChange={(e) => setSplitType(e.target.value as SplitType)}>
          <option value="equal">Reparto igual</option>
          <option value="exact">Importes exactos</option>
          <option value="percentage">Porcentajes</option>
        </select>
      </div>

      <div className="split-participants-header">
        <span>Participantes</span>
        <button type="button" className="btn-link" onClick={toggleSelectAll}>
          {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
        </button>
      </div>
      <div className="split-participants">
        {members.map((m) => {
          const checked = selected.has(m.id);
          return (
            <div key={m.id} className={`split-row${checked ? '' : ' split-row--off'}`}>
              <label className="split-row-check">
                <input type="checkbox" checked={checked} onChange={() => toggleSelected(m.id)} />
                <span>{m.name}</span>
              </label>
              {checked && splitType === 'exact' && (
                <input
                  type="number" step="0.01" min="0" className="split-row-input"
                  placeholder="0.00 €"
                  value={exactAmounts[m.id] ?? ''}
                  onChange={(e) => setExactAmounts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                />
              )}
              {checked && splitType === 'percentage' && (
                <input
                  type="number" step="0.01" min="0" max="100" className="split-row-input"
                  placeholder="0 %"
                  value={percentages[m.id] ?? ''}
                  onChange={(e) => setPercentages((prev) => ({ ...prev, [m.id]: e.target.value }))}
                />
              )}
            </div>
          );
        })}
      </div>

      {splitType === 'exact' && (
        <p className={`split-total ${Math.abs(exactTotal - (amountValue || 0)) > CENTS_TOLERANCE ? 'split-total--off' : 'split-total--ok'}`}>
          Suma: {exactTotal.toFixed(2)} € / {Number.isFinite(amountValue) ? amountValue.toFixed(2) : '0.00'} €
        </p>
      )}
      {splitType === 'percentage' && (
        <p className={`split-total ${Math.abs(percentageTotal - 100) > CENTS_TOLERANCE ? 'split-total--off' : 'split-total--ok'}`}>
          Suma: {percentageTotal.toFixed(2)}% / 100%
        </p>
      )}

      <div className="expense-form-row">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Añadir gasto'}
        </button>
        {initial && onCancelEdit && (
          <button type="button" className="btn-secondary" onClick={onCancelEdit}>Cancelar</button>
        )}
      </div>
      {error && <div className="expense-form-error">{error}</div>}
    </form>
  );
}
