import { useEffect, useRef } from 'react';
import type { DirEntry } from '../lib/files';
import { failureMessage, summarizeForConfirm } from '../lib/deletion';
import './DeleteUi.css';

export interface DeleteFailure {
  name: string;
  error: string;
}

interface Props {
  entries: DirEntry[];
  pending: boolean;
  /** Request-level error (network, 403...). */
  error: string | null;
  /** Per-item failures of a finished request: the dialog switches to a result view. */
  failures: DeleteFailure[] | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Irreversible-delete confirmation. Esc / overlay cancel (unless a request is running). */
export default function ConfirmDeleteDialog({ entries, pending, error, failures, onConfirm, onCancel }: Props) {
  const summary = summarizeForConfirm(entries);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const showingResult = failures !== null;

  useEffect(() => {
    cancelRef.current?.focus();
  }, [showingResult]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || pending) return;
      e.preventDefault();
      onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, onCancel]);

  return (
    <div
      className="confirm-backdrop"
      onClick={() => {
        if (!pending) onCancel();
      }}
    >
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        onClick={(e) => e.stopPropagation()}
      >
        {showingResult ? (
          <>
            <h2 id="confirm-title" className="confirm-title">No se pudo eliminar todo</h2>
            <div id="confirm-desc" className="confirm-body">
              <p>Estos elementos no se han eliminado:</p>
              <ul className="confirm-names">
                {failures.map((f) => (
                  <li key={f.name}>
                    <span className="confirm-name">{f.name}</span> — {failureMessage(f.error)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="confirm-actions">
              <button ref={cancelRef} className="confirm-btn" onClick={onCancel}>Cerrar</button>
            </div>
          </>
        ) : (
          <>
            <h2 id="confirm-title" className="confirm-title">{summary.title}</h2>
            <div id="confirm-desc" className="confirm-body">
              <ul className="confirm-names">
                {summary.names.map((n, i) => (
                  <li key={`${n}-${i}`} className="confirm-name">{n}</li>
                ))}
                {summary.more > 0 && <li className="confirm-more">y {summary.more} más…</li>}
              </ul>
              {summary.hasFolders && <p>Las carpetas se eliminan con todo su contenido.</p>}
              <p className="confirm-warning">
                Esta acción es <strong>irreversible</strong>: no hay papelera, los archivos se borran del servidor.
              </p>
              {error && <p className="confirm-error" role="alert">{error}</p>}
            </div>
            <div className="confirm-actions">
              <button ref={cancelRef} className="confirm-btn" onClick={onCancel} disabled={pending}>
                Cancelar
              </button>
              <button className="confirm-btn confirm-btn--danger" onClick={onConfirm} disabled={pending}>
                {pending ? 'Eliminando…' : 'Eliminar definitivamente'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
