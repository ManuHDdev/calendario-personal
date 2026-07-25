import { useState, useEffect, type FormEvent } from 'react';
import { getCategorias } from '../services/api';
import type { GastoFormData } from '../types';

interface Props {
  onSubmit: (data: GastoFormData) => Promise<void>;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Alta manual de un gasto — siempre queda directamente en estado confirmado (ver spec.md). */
export default function ExpenseForm({ onSubmit }: Props) {
  const [importe, setImporte] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [comercio, setComercio] = useState('');
  const [concepto, setConcepto] = useState('');
  const [categoria, setCategoria] = useState('');
  const [categorias, setCategorias] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getCategorias().then(setCategorias).catch(() => { /* autocompletado best-effort */ });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const value = parseFloat(importe.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setError('Introduce un importe válido');
      return;
    }
    if (!comercio.trim()) {
      setError('El comercio es obligatorio');
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        importe: value,
        fecha,
        comercio: comercio.trim(),
        concepto: concepto.trim() || undefined,
        categoria: categoria.trim() || undefined,
      });
      setImporte('');
      setComercio('');
      setConcepto('');
      setCategoria('');
      setFecha(todayISO());
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
          value={importe} onChange={(e) => setImporte(e.target.value)} required
        />
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
      </div>
      <div className="expense-form-row">
        <input
          type="text" placeholder="Comercio"
          value={comercio} onChange={(e) => setComercio(e.target.value)} required
        />
        <input
          type="text" placeholder="Categoría" list="categorias-list"
          value={categoria} onChange={(e) => setCategoria(e.target.value)}
        />
        <datalist id="categorias-list">
          {categorias.map((c) => <option key={c} value={c} />)}
        </datalist>
      </div>
      <div className="expense-form-row">
        <input
          type="text" placeholder="Concepto (opcional)"
          value={concepto} onChange={(e) => setConcepto(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Añadir gasto'}
        </button>
      </div>
      {error && <div className="expense-form-error">{error}</div>}
    </form>
  );
}
