import { useRef } from 'react';
import type { Gasto } from '../types';

interface ConfirmEdits {
  importe: number;
  fecha: string;
  comercio: string;
  categoria?: string;
}

interface Props {
  gastos: Gasto[];
  onConfirm: (id: string, edits: ConfirmEdits) => Promise<void>;
  onDiscard: (id: string) => Promise<void>;
}

type RowRefs = {
  importe?: HTMLInputElement | null;
  fecha?: HTMLInputElement | null;
  comercio?: HTMLInputElement | null;
  categoria?: HTMLInputElement | null;
};

const ORIGEN_LABEL: Record<string, string> = {
  ticket: '🧾 Ticket',
  banco: '🏦 Banco',
};

/**
 * Sección "Pendientes de revisar" (ver design.md): borradores creados por OCR
 * con estado='pendiente_revision', editables inline antes de confirmar. Usa
 * inputs no controlados (refs) para mantener el componente simple mientras se
 * edita fila a fila.
 */
export default function PendingReview({ gastos, onConfirm, onDiscard }: Props) {
  const rowRefs = useRef<Record<string, RowRefs>>({});

  const getRowRefs = (id: string): RowRefs => {
    if (!rowRefs.current[id]) rowRefs.current[id] = {};
    return rowRefs.current[id];
  };

  const handleConfirm = async (g: Gasto) => {
    const r = getRowRefs(g.id);
    const importeRaw = r.importe?.value ?? String(g.importe);
    const importe = parseFloat(importeRaw.replace(',', '.'));
    const fecha = r.fecha?.value || g.fecha.slice(0, 10);
    const comercio = (r.comercio?.value ?? g.comercio).trim() || g.comercio;
    const categoria = r.categoria?.value?.trim() || undefined;

    if (!Number.isFinite(importe) || importe <= 0) return;
    await onConfirm(g.id, { importe, fecha, comercio, categoria });
  };

  if (gastos.length === 0) {
    return <p className="empty-hint">No hay borradores pendientes de revisión.</p>;
  }

  return (
    <div className="pending-list">
      {gastos.map((g) => (
        <div key={g.id} className="pending-card">
          <span className="pending-origin-badge">{ORIGEN_LABEL[g.origen] ?? g.origen}</span>
          <div className="pending-fields">
            <input
              ref={(el) => { getRowRefs(g.id).importe = el; }}
              type="number" step="0.01" defaultValue={g.importe} aria-label="Importe"
            />
            <input
              ref={(el) => { getRowRefs(g.id).fecha = el; }}
              type="date" defaultValue={g.fecha.slice(0, 10)} aria-label="Fecha"
            />
            <input
              ref={(el) => { getRowRefs(g.id).comercio = el; }}
              type="text" defaultValue={g.comercio} placeholder="Comercio" aria-label="Comercio"
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
        </div>
      ))}
    </div>
  );
}
