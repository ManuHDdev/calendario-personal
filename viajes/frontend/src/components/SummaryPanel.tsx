import { useEffect, useState, type FormEvent } from 'react';
import { downloadExport, getSummary } from '../services/api';
import { PLACE_TYPES, PLACE_TYPE_META, formatCost, formatDistance } from '../lib/format';
import type { Trip, TripSummary } from '../types';

interface Props {
  trip: Trip;
  reloadKey: string;
  canWrite: boolean;
  onUpdateTrip: (data: { name: string; description: string | null; startDate: string | null; endDate: string | null }) => Promise<void>;
  onDeleteTrip: () => Promise<void>;
}

export default function SummaryPanel({ trip, reloadKey, canWrite, onUpdateTrip, onDeleteTrip }: Props) {
  const [summary, setSummary] = useState<TripSummary | null>(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState<'gpx' | 'ics' | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [name, setName] = useState(trip.name);
  const [description, setDescription] = useState(trip.description ?? '');
  const [startDate, setStartDate] = useState(trip.startDate ?? '');
  const [endDate, setEndDate] = useState(trip.endDate ?? '');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getSummary(trip.id)
      .then((s) => !cancelled && setSummary(s))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'No se pudo cargar el resumen'));
    return () => {
      cancelled = true;
    };
  }, [trip.id, reloadKey]);

  const exportAs = async (kind: 'gpx' | 'ics') => {
    setExporting(kind);
    setError('');
    try {
      await downloadExport(trip.id, kind, trip.name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase() || 'viaje');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo exportar');
    } finally {
      setExporting(null);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) return setFormError('El viaje necesita un nombre.');
    if (startDate && endDate && endDate < startDate) return setFormError('La vuelta no puede ser anterior a la ida.');
    try {
      await onUpdateTrip({
        name: name.trim(),
        description: description.trim() || null,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      setEditing(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  };

  return (
    <div className="summary">
      {error && <p className="form-error">{error}</p>}
      {summary && (
        <>
          <div className="stat-grid">
            <div className="stat"><strong>{summary.totalPlaces}</strong><span>lugares</span></div>
            <div className="stat"><strong>{summary.visited}</strong><span>visitados</span></div>
            <div className="stat"><strong>{summary.days}</strong><span>días con plan</span></div>
            <div className="stat"><strong>{summary.unscheduled}</strong><span>sin fecha</span></div>
            <div className="stat"><strong>{formatDistance(summary.straightLineKm * 1000)}</strong><span>en línea recta</span></div>
            <div className="stat"><strong>{formatCost(summary.totalCost)}</strong><span>coste total</span></div>
          </div>
          <ul className="type-counts">
            {PLACE_TYPES.map((t) => (
              <li key={t}>
                <span className="place-dot" style={{ background: PLACE_TYPE_META[t].color }} aria-hidden="true" />
                {PLACE_TYPE_META[t].plural}: <strong>{summary.countsByType[t]}</strong>
              </li>
            ))}
          </ul>
          <p className="field-hint">Los kilómetros por carretera de cada día están en la pestaña Itinerario.</p>
        </>
      )}

      <h4 className="subhead">Exportar</h4>
      <div className="detail-actions">
        <button type="button" className="btn-secondary" onClick={() => void exportAs('gpx')} disabled={exporting !== null}>
          {exporting === 'gpx' ? 'Generando…' : 'Descargar GPX'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => void exportAs('ics')} disabled={exporting !== null}>
          {exporting === 'ics' ? 'Generando…' : 'Descargar calendario (.ics)'}
        </button>
      </div>
      <p className="field-hint">GPX para el GPS o apps de mapas; .ics para añadir el plan al calendario.</p>

      {canWrite && (
        <>
          <h4 className="subhead">Datos del viaje</h4>
          {!editing ? (
            <div className="detail-actions">
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>Editar nombre y fechas</button>
              {!confirmDelete ? (
                <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>Eliminar viaje</button>
              ) : (
                <span className="confirm-inline">
                  ¿Eliminar este viaje?
                  <button type="button" className="btn-danger" onClick={() => void onDeleteTrip()}>Sí, eliminar</button>
                  <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>No</button>
                </span>
              )}
            </div>
          ) : (
            <form className="place-form" onSubmit={save}>
              <label className="field"><span>Nombre</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required /></label>
              <label className="field"><span>Descripción</span><textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} /></label>
              <div className="field-row">
                <label className="field"><span>Ida</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
                <label className="field"><span>Vuelta</span><input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} /></label>
              </div>
              {formError && <p className="form-error">{formError}</p>}
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar</button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
