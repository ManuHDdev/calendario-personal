import { useId, useState } from 'react';
import AutocompleteInput from './AutocompleteInput';
import { importeParaInput, parseImporte } from '../lib/formato';
import type { Gasto } from '../types';

export interface ConfirmEdits {
  importe: number;
  fecha: string;
  comercio: string;
  categoria?: string;
}

interface Props {
  gastos: Gasto[];
  categorias: string[];
  comercios: string[];
  onConfirm: (id: string, edits: ConfirmEdits) => Promise<void>;
  onDiscard: (gasto: Gasto) => void;
}

const ORIGEN_LABEL: Record<string, string> = {
  ticket: 'Ticket',
  banco: 'Banco',
};

/**
 * Banner for drafts read by the Telegram bot (estado 'pendiente_revision').
 * Collapsed into one card; expanding it shows one editable row per draft.
 */
export default function PendingReview({ gastos, categorias, comercios, onConfirm, onDiscard }: Props) {
  const [abierto, setAbierto] = useState(false);
  const panelId = useId();

  if (gastos.length === 0) return null;

  const titulo = gastos.length === 1
    ? 'Tienes 1 ticket del bot por revisar'
    : `Tienes ${gastos.length} tickets del bot por revisar`;

  return (
    <section className="review-banner" aria-label="Tickets por revisar">
      <button
        type="button"
        className="review-toggle"
        aria-expanded={abierto}
        aria-controls={panelId}
        onClick={() => setAbierto((a) => !a)}
      >
        <span className="review-badge" aria-hidden="true">{gastos.length}</span>
        <span className="review-text">
          <span className="review-title">{titulo}</span>
          <span className="review-sub">Revisa los datos y confírmalos para que cuenten en tus gastos.</span>
        </span>
        <svg className="overview-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {abierto && (
        <ul id={panelId} className="draft-list">
          {gastos.map((g) => (
            <DraftRow
              key={g.id}
              gasto={g}
              categorias={categorias}
              comercios={comercios}
              onConfirm={onConfirm}
              onDiscard={onDiscard}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function DraftRow({
  gasto: g, categorias, comercios, onConfirm, onDiscard,
}: { gasto: Gasto } & Pick<Props, 'categorias' | 'comercios' | 'onConfirm' | 'onDiscard'>) {
  const uid = useId();
  const [importe, setImporte] = useState(importeParaInput(g.importe));
  const [fecha, setFecha] = useState(g.fecha ? g.fecha.slice(0, 10) : '');
  const [comercio, setComercio] = useState(g.comercio);
  const [categoria, setCategoria] = useState(g.categoria ?? '');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  const handleConfirm = async () => {
    const valor = parseImporte(importe);
    if (valor === null || valor <= 0) return setError('Escribe un importe mayor que 0.');
    if (!fecha) return setError('Elige la fecha del ticket.');
    if (!comercio.trim()) return setError('Indica el comercio.');
    setError('');
    setWorking(true);
    try {
      await onConfirm(g.id, {
        importe: valor,
        fecha,
        comercio: comercio.trim(),
        categoria: categoria.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido confirmar. Inténtalo de nuevo.');
      setWorking(false);
    }
  };

  return (
    <li className="draft">
      <span className="draft-origin">{ORIGEN_LABEL[g.origen] ?? g.origen}</span>
      <div className="draft-grid">
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-importe`}>Importe</label>
          <div className="amount-wrap">
            <input
              id={`${uid}-importe`}
              className="input"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
            />
            <span className="amount-unit" aria-hidden="true">€</span>
          </div>
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-fecha`}>Fecha</label>
          <input
            id={`${uid}-fecha`}
            className="input"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
        <AutocompleteInput label="Comercio" value={comercio} onChange={setComercio} options={comercios} />
        <AutocompleteInput label="Categoría" value={categoria} onChange={setCategoria} options={categorias} />
      </div>
      {error && <p className="form-alert" role="alert">{error}</p>}
      <div className="draft-actions">
        <button type="button" className="btn btn--ghost" onClick={() => onDiscard(g)} disabled={working}>
          Descartar
        </button>
        <button type="button" className="btn btn--primary" onClick={handleConfirm} disabled={working}>
          {working ? 'Guardando…' : 'Confirmar gasto'}
        </button>
      </div>
    </li>
  );
}
