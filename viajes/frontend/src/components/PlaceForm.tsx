import { useEffect, useState, type FormEvent } from 'react';
import AddressSearch from './AddressSearch';
import { reverseGeocode } from '../services/api';
import { PLACE_TYPES, PLACE_TYPE_META } from '../lib/format';
import type { GeocodeHit, Place, PlaceInput, PlaceType } from '../types';

interface Props {
  /** Place being edited, or null when creating. */
  place: Place | null;
  location: { lat: number; lng: number } | null;
  onLocationChange: (loc: { lat: number; lng: number } | null, focus?: boolean) => void;
  picking: boolean;
  onPickingChange: (picking: boolean) => void;
  /** Incremented by the parent every time the user clicks the map to pick a spot. */
  pickTick: number;
  /** Pre-selected day when adding from a day's "+" button. */
  defaultDate?: string | null;
  tripRange: { start: string | null; end: string | null };
  onSubmit: (input: PlaceInput) => Promise<void>;
  onCancel: () => void;
}

const blank = (v: string): string | null => (v.trim() === '' ? null : v.trim());

export default function PlaceForm({
  place,
  location,
  onLocationChange,
  picking,
  onPickingChange,
  pickTick,
  defaultDate = null,
  tripRange,
  onSubmit,
  onCancel,
}: Props) {
  const [type, setType] = useState<PlaceType>(place?.type ?? 'interes');
  const [name, setName] = useState(place?.name ?? '');
  const [address, setAddress] = useState(place?.address ?? '');
  const [notes, setNotes] = useState(place?.notes ?? '');
  const [url, setUrl] = useState(place?.url ?? '');
  const [cost, setCost] = useState(place?.cost != null ? String(place.cost) : '');
  const [visitDate, setVisitDate] = useState(place?.visitDate ?? defaultDate ?? '');
  const [startTime, setStartTime] = useState(place?.startTime ?? '');
  const [durationMin, setDurationMin] = useState(place?.durationMin != null ? String(place.durationMin) : '');
  const [checkIn, setCheckIn] = useState(place?.checkIn ?? tripRange.start ?? '');
  const [checkOut, setCheckOut] = useState(place?.checkOut ?? tripRange.end ?? '');
  const [visited, setVisited] = useState(place?.visited ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isLodging = type === 'alojamiento';

  // After a map click: fill the address/name from a reverse lookup, without overwriting what the user typed.
  useEffect(() => {
    if (pickTick === 0 || !location) return;
    let cancelled = false;
    reverseGeocode(location.lat, location.lng)
      .then((hit) => {
        if (cancelled || !hit) return;
        setAddress((prev) => prev || hit.displayName);
        setName((prev) => prev || hit.displayName.split(',')[0].trim());
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Only re-run when the user picks a new spot on the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickTick]);

  const applyHit = (hit: GeocodeHit) => {
    onLocationChange({ lat: hit.lat, lng: hit.lng }, true);
    setAddress(hit.displayName);
    setName((prev) => prev || hit.displayName.split(',')[0].trim());
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Ponle un nombre al lugar.');
    if (!location) return setError('Elige la ubicación: busca una dirección o pulsa en el mapa.');
    const costNum = cost.trim() === '' ? null : Number(cost.replace(',', '.'));
    if (costNum !== null && (!Number.isFinite(costNum) || costNum < 0)) return setError('El coste no es válido.');
    const durNum = durationMin.trim() === '' ? null : Number(durationMin);
    if (durNum !== null && (!Number.isInteger(durNum) || durNum < 1)) return setError('La duración debe ser un número de minutos.');
    if (isLodging && checkIn && checkOut && checkOut < checkIn) return setError('La salida no puede ser anterior a la entrada.');
    if (!isLodging && startTime && !visitDate) return setError('Para fijar una hora hace falta una fecha de visita.');

    const input: PlaceInput = {
      type,
      name: name.trim(),
      lat: location.lat,
      lng: location.lng,
      address: blank(address),
      notes: blank(notes),
      url: blank(url),
      cost: costNum,
      visitDate: isLodging ? null : blank(visitDate),
      startTime: isLodging ? null : visitDate ? blank(startTime) : null,
      durationMin: isLodging ? null : durNum,
      checkIn: isLodging ? blank(checkIn) : null,
      checkOut: isLodging ? blank(checkOut) : null,
      visited,
    };
    setSaving(true);
    try {
      await onSubmit(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
      setSaving(false);
    }
  };

  return (
    <form className="place-form" onSubmit={submit}>
      <h3 className="panel-title">{place ? 'Editar lugar' : 'Nuevo lugar'}</h3>

      <div className="type-picker" role="radiogroup" aria-label="Tipo de lugar">
        {PLACE_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            className={`type-chip${type === t ? ' type-chip--active' : ''}`}
            style={{ ['--chip-color' as string]: PLACE_TYPE_META[t].color }}
            onClick={() => setType(t)}
          >
            {PLACE_TYPE_META[t].label}
          </button>
        ))}
      </div>

      <fieldset className="form-block">
        <legend>Ubicación</legend>
        <AddressSearch onPick={applyHit} />
        <div className="location-row">
          <button
            type="button"
            className={`btn-secondary${picking ? ' btn-active' : ''}`}
            onClick={() => onPickingChange(!picking)}
          >
            {picking ? 'Pulsa en el mapa…' : 'Elegir en el mapa'}
          </button>
          <span className="location-readout">
            {location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : 'Sin ubicación'}
          </span>
        </div>
      </fieldset>

      <label className="field">
        <span>Nombre</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} required />
      </label>
      <label className="field">
        <span>Dirección</span>
        <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} />
      </label>

      {isLodging ? (
        <div className="field-row">
          <label className="field">
            <span>Entrada</span>
            <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </label>
          <label className="field">
            <span>Salida</span>
            <input type="date" value={checkOut} min={checkIn || undefined} onChange={(e) => setCheckOut(e.target.value)} />
          </label>
        </div>
      ) : (
        <>
          <div className="field-row">
            <label className="field">
              <span>Día de visita</span>
              <input
                type="date"
                value={visitDate}
                min={tripRange.start ?? undefined}
                max={tripRange.end ?? undefined}
                onChange={(e) => {
                  setVisitDate(e.target.value);
                  if (!e.target.value) setStartTime('');
                }}
              />
            </label>
            <label className="field">
              <span>Hora</span>
              <input type="time" value={startTime} disabled={!visitDate} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label className="field">
              <span>Duración (min)</span>
              <input type="number" min={1} max={1440} value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
            </label>
          </div>
          <p className="field-hint">Sin fecha, el lugar queda en la lista de pendientes.</p>
        </>
      )}

      <div className="field-row">
        <label className="field">
          <span>Coste (€)</span>
          <input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
        </label>
        <label className="field field-grow">
          <span>Enlace</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </label>
      </div>

      <label className="field">
        <span>Notas</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={4000} />
      </label>

      <label className="check-field">
        <input type="checkbox" checked={visited} onChange={(e) => setVisited(e.target.checked)} />
        <span>{isLodging ? 'Ya nos hemos alojado' : 'Visitado'}</span>
      </label>

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Guardando…' : place ? 'Guardar cambios' : 'Añadir lugar'}
        </button>
      </div>
    </form>
  );
}
