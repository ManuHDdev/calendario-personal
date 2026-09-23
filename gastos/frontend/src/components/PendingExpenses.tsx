import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getCategorias } from '../services/api';
import type { Gasto, GastoFormData } from '../types';

interface ConfirmEdits {
  importe: number;
  fecha: string;
  comercio: string;
  concepto?: string;
  categoria?: string;
}

interface Props {
  gastos: Gasto[];
  onCreate: (data: GastoFormData) => Promise<void>;
  onConfirm: (id: string, edits: ConfirmEdits) => Promise<void>;
  onDiscard: (id: string) => Promise<void>;
}

type RowRefs = {
  importe?: HTMLInputElement | null;
  fecha?: HTMLInputElement | null;
  comercio?: HTMLInputElement | null;
  concepto?: HTMLInputElement | null;
  categoria?: HTMLInputElement | null;
};

/**
 * Sección "Gastos pendientes" (ver design.md): gastos previstos (estado
 * 'previsto') — importe conocido, fecha OPCIONAL, creados manualmente aquí,
 * no por OCR. Nunca cuentan en /totales, igual que los borradores OCR.
 * Estructural y visualmente separada de "Pendientes de revisar"
 * (PendingReview.tsx) pese al nombre parecido: son dos cosas distintas.
 *
 * Reutiliza el mismo patrón que PendingReview.tsx para la lista (inputs no
 * controlados vía refs, edición fila a fila) y el mismo patrón que
 * ExpenseForm.tsx para el formulario de alta (autocompletado de categoría
 * vía datalist).
 */
export default function PendingExpenses({ gastos, onCreate, onConfirm, onDiscard }: Props) {
  const rowRefs = useRef<Record<string, RowRefs>>({});
  const [confirmErrors, setConfirmErrors] = useState<Record<string, string>>({});

  const [importe, setImporte] = useState('');
  const [fecha, setFecha] = useState('');
  const [comercio, setComercio] = useState('');
  const [concepto, setConcepto] = useState('');
  const [categoria, setCategoria] = useState('');
  const [categorias, setCategorias] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    getCategorias().then(setCategorias).catch(() => { /* autocompletado best-effort */ });
  }, []);

  const getRowRefs = (id: string): RowRefs => {
    if (!rowRefs.current[id]) rowRefs.current[id] = {};
    return rowRefs.current[id];
  };

  const total = gastos.reduce((sum, g) => sum + g.importe, 0);

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    const value = parseFloat(importe.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setFormError('Introduce un importe válido');
      return;
    }
    if (!comercio.trim()) {
      setFormError('El comercio es obligatorio');
      return;
    }

    setSaving(true);
    try {
      await onCreate({
        importe: value,
        fecha: fecha || undefined,
        comercio: comercio.trim(),
        concepto: concepto.trim() || undefined,
        categoria: categoria.trim() || undefined,
        estado: 'previsto',
      });
      setImporte('');
      setFecha('');
      setComercio('');
      setConcepto('');
      setCategoria('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar el gasto previsto');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async (g: Gasto) => {
    const r = getRowRefs(g.id);
    const fechaValue = r.fecha?.value ?? '';
    if (!fechaValue) {
      setConfirmErrors((prev) => ({ ...prev, [g.id]: 'Introduce una fecha para confirmar este gasto' }));
      return;
    }
    setConfirmErrors((prev) => {
      if (!(g.id in prev)) return prev;
      const next = { ...prev };
      delete next[g.id];
      return next;
    });

    const importeRaw = r.importe?.value ?? String(g.importe);
    const importeValue = parseFloat(importeRaw.replace(',', '.'));
    const comercioValue = (r.comercio?.value ?? g.comercio).trim() || g.comercio;
    const conceptoValue = r.concepto?.value?.trim() || undefined;
    const categoriaValue = r.categoria?.value?.trim() || undefined;

    if (!Number.isFinite(importeValue) || importeValue <= 0) return;
    await onConfirm(g.id, {
      importe: importeValue,
      fecha: fechaValue,
      comercio: comercioValue,
      concepto: conceptoValue,
      categoria: categoriaValue,
    });
  };

  return (
    <div className="pending-expenses">
      <form className="expense-form" onSubmit={handleCreateSubmit}>
        <div className="expense-form-row">
          <input
            type="number" step="0.01" min="0" placeholder="Importe (€)"
            value={importe} onChange={(e) => setImporte(e.target.value)} required
          />
          <input
            type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
            aria-label="Fecha prevista (opcional)"
          />
        </div>
        <div className="expense-form-row">
          <input
            type="text" placeholder="Comercio"
            value={comercio} onChange={(e) => setComercio(e.target.value)} required
          />
          <input
            type="text" placeholder="Categoría" list="previstos-categorias-list"
            value={categoria} onChange={(e) => setCategoria(e.target.value)}
          />
          <datalist id="previstos-categorias-list">
            {categorias.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div className="expense-form-row">
          <input
            type="text" placeholder="Concepto (opcional)"
            value={concepto} onChange={(e) => setConcepto(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Añadir previsto'}
          </button>
        </div>
        {formError && <div className="expense-form-error">{formError}</div>}
      </form>

      {gastos.length === 0 ? (
        <p className="empty-hint">No hay gastos previstos pendientes.</p>
      ) : (
        <>
          <p className="pending-expenses-total">Total previsto: {total.toFixed(2)} €</p>
          <div className="pending-list">
            {gastos.map((g) => (
              <div key={g.id} className="pending-card">
                <div className="pending-fields">
                  <input
                    ref={(el) => { getRowRefs(g.id).importe = el; }}
                    type="number" step="0.01" defaultValue={g.importe} aria-label="Importe"
                  />
                  <input
                    ref={(el) => { getRowRefs(g.id).fecha = el; }}
                    type="date" defaultValue={g.fecha ? g.fecha.slice(0, 10) : ''} aria-label="Fecha"
                  />
                  <input
                    ref={(el) => { getRowRefs(g.id).comercio = el; }}
                    type="text" defaultValue={g.comercio} placeholder="Comercio" aria-label="Comercio"
                  />
                  <input
                    ref={(el) => { getRowRefs(g.id).concepto = el; }}
                    type="text" defaultValue={g.concepto ?? ''} placeholder="Concepto" aria-label="Concepto"
                  />
                  <input
                    ref={(el) => { getRowRefs(g.id).categoria = el; }}
                    type="text" defaultValue={g.categoria ?? ''} placeholder="Categoría" aria-label="Categoría"
                  />
                </div>
                <div className="pending-actions">
                  <button className="btn-confirm" onClick={() => handleConfirm(g)}>Confirmar</button>
                  <button className="btn-discard" onClick={() => onDiscard(g.id)}>Descartar</button>
                </div>
                {confirmErrors[g.id] && <div className="expense-form-error">{confirmErrors[g.id]}</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
