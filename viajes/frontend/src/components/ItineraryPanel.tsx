import { useEffect, useMemo, useState } from 'react';
import { getItinerary } from '../services/api';
import {
  PROFILE_LABELS,
  approxPrefix,
  dayColor,
  formatDay,
  formatDistance,
  formatDuration,
} from '../lib/format';
import type { Itinerary, ItineraryDay, Place, Profile } from '../types';
import type { MapRoute } from './TripMap';

interface Props {
  tripId: string;
  /** Changes whenever places change, to refetch the itinerary. */
  reloadKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRoutesChange: (routes: MapRoute[]) => void;
}

/** Waypoints in the order the backend routed them (lodging at both ends when present). */
function waypointsOf(day: ItineraryDay, withLodging: boolean): Place[] {
  const list: Place[] = [];
  if (withLodging && day.lodging) list.push(day.lodging);
  list.push(...day.stops);
  if (withLodging && day.lodging && day.stops.length > 0) list.push(day.lodging);
  return list;
}

export default function ItineraryPanel({ tripId, reloadKey, selectedId, onSelect, onRoutesChange }: Props) {
  const [profile, setProfile] = useState<Profile>('driving');
  const [withLodging, setWithLodging] = useState(true);
  const [data, setData] = useState<Itinerary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getItinerary(tripId, profile, withLodging)
      .then((it) => !cancelled && setData(it))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'No se pudo calcular el itinerario'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tripId, profile, withLodging, reloadKey]);

  const routes = useMemo<MapRoute[]>(() => {
    if (!data) return [];
    return data.days
      .map((day, i) => ({ day, i }))
      .filter(({ day }) => !hidden.has(day.date))
      .map(({ day, i }) => ({
        key: day.date,
        color: dayColor(i),
        geometry: day.geometry,
        dashed: day.approx,
      }));
  }, [data, hidden]);

  useEffect(() => {
    onRoutesChange(routes);
  }, [routes, onRoutesChange]);

  // Leaving the tab removes the route lines from the map.
  useEffect(() => () => onRoutesChange([]), [onRoutesChange]);

  const totals = useMemo(() => {
    const days = data?.days ?? [];
    return {
      distanceM: days.reduce((s, d) => s + d.totalDistanceM, 0),
      durationS: days.reduce((s, d) => s + d.totalDurationS, 0),
      approx: days.some((d) => d.approx),
    };
  }, [data]);

  const toggleDay = (date: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  return (
    <div className="itinerary">
      <div className="itinerary-controls">
        <div className="segmented" role="radiogroup" aria-label="Modo de transporte">
          {(Object.keys(PROFILE_LABELS) as Profile[]).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={profile === p} className={profile === p ? 'active' : ''} onClick={() => setProfile(p)}>
              {PROFILE_LABELS[p]}
            </button>
          ))}
        </div>
        <label className="check-field">
          <input type="checkbox" checked={withLodging} onChange={(e) => setWithLodging(e.target.checked)} />
          <span>Salir y volver al alojamiento de esa noche</span>
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading && !data && <p className="empty-hint">Calculando rutas…</p>}

      {data && data.days.length === 0 && (
        <p className="empty-hint">Ningún lugar tiene fecha todavía. Asigna un día a los puntos de interés para ver el itinerario.</p>
      )}

      {data && data.days.length > 0 && (
        <p className="itinerary-total">
          Total del viaje: <strong>{approxPrefix(totals.approx)}{formatDistance(totals.distanceM)}</strong> ·{' '}
          <strong>{approxPrefix(totals.approx)}{formatDuration(totals.durationS)}</strong>
          {loading && <span className="muted"> (actualizando…)</span>}
        </p>
      )}

      {data?.days.map((day, i) => {
        const waypoints = waypointsOf(day, withLodging);
        const consistent = waypoints.length === day.legs.length + 1;
        return (
          <section key={day.date} className="day-card">
            <header>
              <span className="day-swatch" style={{ background: dayColor(i) }} aria-hidden="true" />
              <h4>{formatDay(day.date)}</h4>
              <span className="day-totals" title={day.approx ? 'Distancia aproximada en línea recta (sin datos de carretera)' : undefined}>
                {approxPrefix(day.approx)}{formatDistance(day.totalDistanceM)} · {approxPrefix(day.approx)}{formatDuration(day.totalDurationS)}
              </span>
              <label className="day-visible" title="Ver la ruta de este día en el mapa">
                <input type="checkbox" checked={!hidden.has(day.date)} onChange={() => toggleDay(day.date)} aria-label={`Mostrar ${formatDay(day.date)} en el mapa`} />
              </label>
            </header>
            {day.approx && <p className="approx-note">Sin datos de carretera: distancias aproximadas en línea recta.</p>}
            <ol className="stop-list">
              {waypoints.map((p, idx) => {
                const leg = consistent && idx > 0 ? day.legs[idx - 1] : null;
                const isLodgingEnd = p.type === 'alojamiento';
                return (
                  <li key={`${p.id}-${idx}`}>
                    {leg && (
                      <div className="leg">
                        &darr; {approxPrefix(day.approx)}{formatDistance(leg.distanceM)} · {approxPrefix(day.approx)}{formatDuration(leg.durationS)}
                      </div>
                    )}
                    <button type="button" className={`stop${p.id === selectedId ? ' stop--selected' : ''}${isLodgingEnd ? ' stop--lodging' : ''}`} onClick={() => onSelect(p.id)}>
                      <span className="stop-time">{p.startTime ?? ''}</span>
                      <span className="stop-name">{p.name}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}

      {data && data.unscheduled.length > 0 && (
        <p className="muted unscheduled-note">
          {data.unscheduled.length} lugar{data.unscheduled.length === 1 ? '' : 'es'} sin fecha no entra{data.unscheduled.length === 1 ? '' : 'n'} en el itinerario.
        </p>
      )}
    </div>
  );
}
