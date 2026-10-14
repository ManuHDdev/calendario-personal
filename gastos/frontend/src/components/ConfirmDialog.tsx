import { useState, type ReactNode } from 'react';
import Dialog from './Dialog';

interface Props {
  title: string;
  /** What is about to happen, in plain words. */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/** In-app replacement for window.confirm (accessible, focus returns to the trigger). */
export default function ConfirmDialog({
  title, children, confirmLabel, cancelLabel = 'Cancelar', danger, onConfirm, onClose,
}: Props) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setWorking(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido completar. Inténtalo de nuevo.');
      setWorking(false);
    }
  };

  return (
    <Dialog
      title={title}
      onClose={onClose}
      dismissible={!working}
      initialFocus=".btn--ghost"
      footer={(
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={working}>{cancelLabel}</button>
          <button
            type="button"
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={handleConfirm}
            disabled={working}
          >
            {working ? 'Un momento…' : confirmLabel}
          </button>
        </>
      )}
    >
      <div className="confirm-body">{children}</div>
      {error && <p className="form-alert" role="alert">{error}</p>}
    </Dialog>
  );
}
