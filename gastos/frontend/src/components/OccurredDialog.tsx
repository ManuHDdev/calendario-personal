import { useId, useState, type FormEvent } from 'react';
import Dialog from './Dialog';
import { formatMoney, hoyLocal } from '../lib/formato';
import type { Gasto } from '../types';

interface Props {
  gasto: Gasto;
  /** Confirms the forecast on the given real date (YYYY-MM-DD). */
  onConfirm: (fecha: string) => Promise<void>;
  onClose: () => void;
}

/** Asks for the real date when a forecast has finally happened ("Ya ha ocurrido"). */
export default function OccurredDialog({ gasto, onConfirm, onClose }: Props) {
  const formId = useId();
  const [fecha, setFecha] = useState(hoyLocal());
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const esGanancia = gasto.tipo === 'ganancia';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fecha) {
      setError('Elige el día en que ocurrió.');
      return;
    }
    setWorking(true);
    setError('');
    try {
      await onConfirm(fecha);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar. Inténtalo de nuevo.');
      setWorking(false);
    }
  };

  return (
    <Dialog
      title={esGanancia ? 'Ya lo has cobrado' : 'Ya lo has pagado'}
      onClose={onClose}
      dismissible={!working}
      initialFocus="input[type=date]"
      footer={(
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={working}>Cancelar</button>
          <button type="submit" form={formId} className="btn btn--primary" disabled={working}>
            {working ? 'Guardando…' : 'Confirmar'}
          </button>
        </>
      )}
    >
      <form id={formId} className="movement-form" onSubmit={handleSubmit} noValidate>
        <p className="confirm-body">
          <strong>{gasto.comercio}</strong> por {formatMoney(gasto.importe)} pasará a contar en tus totales.
        </p>
        <div className="field">
          <label className="field-label" htmlFor={`${formId}-fecha`}>
            {esGanancia ? '¿Qué día lo cobraste?' : '¿Qué día lo pagaste?'}
          </label>
          <input
            id={`${formId}-fecha`}
            className="input"
            type="date"
            value={fecha}
            aria-invalid={error ? true : undefined}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
        {error && <p className="form-alert" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}
