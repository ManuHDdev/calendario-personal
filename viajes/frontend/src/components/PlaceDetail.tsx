import { useEffect, useState } from 'react';
import { getNearestLodging } from '../services/api';
import { PLACE_TYPE_META, PROFILE_LABELS, approxPrefix, formatCost, formatDate, formatDay, formatDistance, formatDuration } from '../lib/format';
import type { NearestLodging, Place, Profile } from '../types';

interface Props {
  tripId: string;
  place: Place;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleVisited: () => void;
  onMeasureFrom: () => void;
  onClose: () => void;
  onSelectPlace: (id: string) => void;
}

export default function PlaceDetail({ tripId, place, canWrite, onEdit, onDelete, onToggleVisited, onMeasureFrom, onClose, onSelectPlace }: Props) {
  const meta = PLACE_TYPE_META[place.type];
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [nearest, setNearest] = useState<NearestLodging[] | null>(null);
  const [nearestError, setNearestError] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<Profile>('driving');

  // Reset transient state when another place is selected.
  useEffect(() => {
    setConfirmDelete(false);
    setNearest(null);
    setNearestError('');
  }, [place.id]);

  const loadNearest = async (road: boolean, prof: Profile = profile) => {
    setLoading(true);
    setNearestError('');
    try {
      setNearest((await getNearestLodging(tripId, place.id, prof, road)).lodgings);
    } catch (err) {
      setNearestError(err instanceof Error ? err.message : 'No se pudo calcular');
    } finally {
      setLoading(false);
    }
  };

  const isLodging = place.type === 'alojamiento';

  return (
    <div className="place-detail">
      <div className="detail-head">
        <span className="place-dot place-dot--lg" style={{ background: meta.color }} aria-hidden="true" />
        <div className="detail-title">
          <h3>{place.name}</h3>
          <span className="place-sub">{meta.label}</span>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar detalle">
          &times;
        </button>
      </div>

      <dl className="detail-list">
        {place.address && (<><dt>Dirección</dt><dd>{place.address}</dd></>)}
        {isLodging && (place.checkIn || place.checkOut) && (
          <><dt>Estancia</dt><dd>{place.checkIn ? formatDate(place.checkIn) : '?'} &rarr; {place.checkOut ? formatDate(place.checkOut) : '?'}</dd></>
        )}
        {!isLodging && (
          <><dt>Visita</dt><dd>{place.visitDate ? `${formatDay(place.visitDate)}${place.startTime ? `, ${place.startTime}` : ''}${place.durationMin ? ` (${place.durationMin} min)` : ''}` : 'Pendiente de fecha'}</dd></>
        )}
        {place.cost != null && (<><dt>Coste</dt><dd>{formatCost(place.cost)}</dd></>)}
        {place.url && (<><dt>Enlace</dt><dd><a href={place.url} target="_blank" rel="noopener noreferrer">{place.url}</a></dd></>)}
        {place.notes && (<><dt>Notas</dt><dd className="detail-notes">{place.notes}</dd></>)}
      </dl>

      <label className="check-field">
        <input type="checkbox" checked={place.visited} disabled={!canWrite} onChange={onToggleVisited} />
        <span>{isLodging ? 'Ya nos hemos alojado' : 'Visitado'}</span>
      </label>

      <div className="detail-actions">
        <button type="button" className="btn-secondary" onClick={onMeasureFrom}>Medir desde aquí</button>
        {!isLodging && (
          <button type="button" className="btn-secondary" onClick={() => void loadNearest(false)} disabled={loading}>
            Alojamiento más cercano
          </button>
        )}
        {canWrite && <button type="button" className="btn-secondary" onClick={onEdit}>Editar</button>}
        {canWrite && !confirmDelete && <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>Eliminar</button>}
        {canWrite && confirmDelete && (
          <span className="confirm-inline">
            ¿Eliminar?
            <button type="button" className="btn-danger" onClick={onDelete}>Sí, eliminar</button>
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>No</button>
          </span>
        )}
      </div>

      {nearestError && <p className="form-error">{nearestError}</p>}
      {nearest && (
        <div className="nearest">
          <h4>Alojamientos por cercanía</h4>
          {nearest.length === 0 ? (
            <p className="empty-hint">Este viaje aún no tiene alojamientos.</p>
          ) : (
            <>
              <ul>
                {nearest.map((n) => (
                  <li key={n.lodging.id}>
                    <button type="button" className="link-btn" onClick={() => onSelectPlace(n.lodging.id)}>{n.lodging.name}</button>
                    <span className="nearest-meta">
                      {formatDistance(n.straightM)} en línea recta
                      {n.road && ` · ${approxPrefix(n.road.approx)}${formatDistance(n.road.distanceM)}, ${approxPrefix(n.road.approx)}${formatDuration(n.road.durationS)} (${PROFILE_LABELS[profile].toLowerCase()})`}
                      {n.coversVisitDate && <span className="badge">cubre el día de la visita</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="nearest-road">
                <select
                  value={profile}
                  onChange={(e) => {
                    const p = e.target.value as Profile;
                    setProfile(p);
                    void loadNearest(true, p);
                  }}
                  aria-label="Modo de transporte"
                >
                  {(Object.keys(PROFILE_LABELS) as Profile[]).map((p) => <option key={p} value={p}>{PROFILE_LABELS[p]}</option>)}
                </select>
                <button type="button" className="btn-secondary" onClick={() => void loadNearest(true)} disabled={loading}>
                  {loading ? 'Calculando…' : 'Calcular por carretera'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
