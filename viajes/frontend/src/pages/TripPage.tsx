import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import keycloak, { canWrite } from '../services/keycloak';
import {
  ApiError,
  createPlace,
  deletePlace,
  deleteTrip,
  getTrip,
  reorderPlaces,
  updatePlace,
  updateTrip,
} from '../services/api';
import AppLauncher from '../components/AppLauncher';
import ThemeToggle from '../components/ThemeToggle';
import TripMap, { type MapRoute } from '../components/TripMap';
import PlaceList from '../components/PlaceList';
import PlaceDetail from '../components/PlaceDetail';
import PlaceForm from '../components/PlaceForm';
import ItineraryPanel from '../components/ItineraryPanel';
import MeasurePanel from '../components/MeasurePanel';
import SummaryPanel from '../components/SummaryPanel';
import { groupPlaces, type ReorderRequest } from '../lib/grouping';
import { formatDate } from '../lib/format';
import type { Place, PlaceInput, Trip } from '../types';

type Tab = 'places' | 'itinerary' | 'measure' | 'summary';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'places', label: 'Lugares' },
  { id: 'itinerary', label: 'Itinerario' },
  { id: 'measure', label: 'Medir' },
  { id: 'summary', label: 'Resumen' },
];

export default function TripPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const writable = canWrite();
  const username = (keycloak.tokenParsed as { preferred_username?: string })?.preferred_username ?? '';

  const [trip, setTrip] = useState<Trip | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [tab, setTab] = useState<Tab>('places');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Place form state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Place | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [pickTick, setPickTick] = useState(0);
  const [focus, setFocus] = useState<{ lat: number; lng: number; key: number } | null>(null);

  const [fitSignal, setFitSignal] = useState(0);
  const [itineraryRoutes, setItineraryRoutes] = useState<MapRoute[]>([]);
  const [measureRoutes, setMeasureRoutes] = useState<MapRoute[]>([]);
  const [measureFrom, setMeasureFrom] = useState('');
  const [measureTo, setMeasureTo] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTrip(id)
      .then((t) => {
        if (cancelled) return;
        const { places: ps, ...rest } = t;
        setTrip(rest);
        setPlaces(ps);
        setFitSignal((n) => n + 1);
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError && err.status === 404 ? 'Este viaje no existe o se ha eliminado.' : (err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const groups = useMemo(() => groupPlaces(places), [places]);
  const stopNumbers = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of groups.days) day.places.forEach((p, i) => map.set(p.id, i + 1));
    return map;
  }, [groups]);

  // Keys that change only when something the itinerary / summary depends on changes.
  const itineraryKey = useMemo(
    () => places.map((p) => `${p.id}:${p.type}:${p.visitDate}:${p.dayOrder}:${p.lat}:${p.lng}:${p.checkIn}:${p.checkOut}`).join('|'),
    [places],
  );
  const summaryKey = useMemo(
    () => places.map((p) => `${p.id}:${p.type}:${p.visitDate}:${p.visited}:${p.cost}:${p.lat}:${p.lng}:${p.dayOrder}`).join('|'),
    [places],
  );

  const selected = places.find((p) => p.id === selectedId) ?? null;

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((m) => (m === msg ? '' : m)), 4000);
  };
  const fail = (err: unknown, fallback: string) => setError(err instanceof Error ? err.message : fallback);

  // ── Place form ──
  const openForm = (place: Place | null, date: string | null = null) => {
    setEditing(place);
    setDefaultDate(date);
    setDraft(place ? { lat: place.lat, lng: place.lng } : null);
    setPicking(!place);
    setPickTick(0);
    setFormOpen(true);
    setTab('places');
    setError('');
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setDraft(null);
    setPicking(false);
  };

  const handlePick = useCallback((lat: number, lng: number) => {
    setDraft({ lat, lng });
    setPicking(false);
    setPickTick((n) => n + 1);
  }, []);

  const submitPlace = async (input: PlaceInput) => {
    if (!trip) return;
    if (editing) {
      const saved = await updatePlace(trip.id, editing.id, input);
      setPlaces((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      setSelectedId(saved.id);
    } else {
      const saved = await createPlace(trip.id, input);
      setPlaces((prev) => [...prev, saved]);
      setSelectedId(saved.id);
    }
    closeForm();
  };

  // ── Place actions ──
  const toggleVisited = async (place: Place) => {
    if (!trip) return;
    setPlaces((prev) => prev.map((p) => (p.id === place.id ? { ...p, visited: !p.visited } : p)));
    try {
      await updatePlace(trip.id, place.id, { visited: !place.visited });
    } catch (err) {
      setPlaces((prev) => prev.map((p) => (p.id === place.id ? { ...p, visited: place.visited } : p)));
      fail(err, 'No se pudo actualizar');
    }
  };

  const removePlace = async (place: Place) => {
    if (!trip) return;
    try {
      await deletePlace(trip.id, place.id);
      setPlaces((prev) => prev.filter((p) => p.id !== place.id));
      setSelectedId(null);
      flash(`"${place.name}" eliminado`);
    } catch (err) {
      fail(err, 'No se pudo eliminar');
    }
  };

  const reorder = async (req: ReorderRequest) => {
    if (!trip) return;
    const snapshot = places;
    // Optimistic: apply the new date/order locally, roll back on failure.
    setPlaces((prev) =>
      prev.map((p) => {
        const idx = req.placeIds.indexOf(p.id);
        if (idx === -1) return p;
        return { ...p, visitDate: req.date, dayOrder: idx, startTime: req.date === null ? null : p.startTime };
      }),
    );
    try {
      const res = await reorderPlaces(trip.id, req.date, req.placeIds);
      setPlaces(res.places);
    } catch (err) {
      setPlaces(snapshot);
      fail(err, 'No se pudo reordenar');
    }
  };

  // ── Trip actions ──
  const saveTrip = async (data: { name: string; description: string | null; startDate: string | null; endDate: string | null }) => {
    if (!trip) return;
    setTrip(await updateTrip(trip.id, data));
  };

  const removeTrip = async () => {
    if (!trip) return;
    try {
      await deleteTrip(trip.id);
      navigate('/');
    } catch (err) {
      fail(err, 'No se pudo eliminar el viaje');
    }
  };

  const routes = tab === 'itinerary' ? itineraryRoutes : tab === 'measure' ? measureRoutes : [];

  if (loading) {
    return (
      <div className="fullscreen-status">
        <div className="spinner" />
        <p>Cargando viaje…</p>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="fullscreen-status">
        <p className="fullscreen-status-title">{error || 'No se pudo cargar el viaje'}</p>
        <button className="btn-secondary" onClick={() => navigate('/')}>Volver a mis viajes</button>
      </div>
    );
  }

  return (
    <div className="trip-layout">
      <header className="viajes-header">
        <div className="viajes-header-left">
          <button className="icon-btn" onClick={() => navigate('/')} aria-label="Volver a mis viajes" title="Mis viajes">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div className="trip-heading">
            <h1 className="viajes-title">{trip.name}</h1>
            {(trip.startDate || trip.endDate) && (
              <span className="trip-dates">
                {trip.startDate ? formatDate(trip.startDate) : '?'} &rarr; {trip.endDate ? formatDate(trip.endDate) : '?'}
              </span>
            )}
          </div>
        </div>
        <div className="viajes-header-right">
          <ThemeToggle />
          <AppLauncher />
          {username && <span className="viajes-username">{username}</span>}
          <button className="viajes-logout-btn" onClick={() => keycloak.logout()}>Salir</button>
        </div>
      </header>

      <div className="trip-body">
        <aside className="trip-sidebar">
          {writable && !formOpen && (
            <button className="btn-primary add-place-btn" onClick={() => openForm(null)}>+ Añadir lugar</button>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error} <button className="link-btn" onClick={() => setError('')}>Cerrar</button>
            </p>
          )}
          {notice && <p className="notice" role="status">{notice}</p>}

          {formOpen ? (
            <PlaceForm
              key={editing?.id ?? 'new'}
              place={editing}
              location={draft}
              onLocationChange={(loc, shouldFocus) => {
                setDraft(loc);
                if (loc && shouldFocus) setFocus({ ...loc, key: Date.now() });
              }}
              picking={picking}
              onPickingChange={setPicking}
              pickTick={pickTick}
              defaultDate={defaultDate}
              tripRange={{ start: trip.startDate, end: trip.endDate }}
              onSubmit={submitPlace}
              onCancel={closeForm}
            />
          ) : (
            <>
              {selected && (
                <PlaceDetail
                  tripId={trip.id}
                  place={selected}
                  canWrite={writable}
                  onEdit={() => openForm(selected)}
                  onDelete={() => void removePlace(selected)}
                  onToggleVisited={() => void toggleVisited(selected)}
                  onMeasureFrom={() => {
                    setMeasureFrom(selected.id);
                    setMeasureTo((to) => (to === selected.id ? '' : to));
                    setTab('measure');
                  }}
                  onClose={() => setSelectedId(null)}
                  onSelectPlace={setSelectedId}
                />
              )}

              <nav className="tabs" role="tablist">
                {TABS.map((t) => (
                  <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                    {t.label}
                  </button>
                ))}
              </nav>

              {tab === 'places' && (
                <PlaceList
                  groups={groups}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  canWrite={writable}
                  onReorder={(req) => void reorder(req)}
                  onToggleVisited={(p) => void toggleVisited(p)}
                  onAddForDay={(date) => openForm(null, date)}
                />
              )}
              {tab === 'itinerary' && (
                <ItineraryPanel
                  tripId={trip.id}
                  reloadKey={itineraryKey}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onRoutesChange={setItineraryRoutes}
                />
              )}
              {tab === 'measure' && (
                <MeasurePanel
                  tripId={trip.id}
                  places={places}
                  fromId={measureFrom}
                  toId={measureTo}
                  onFromChange={setMeasureFrom}
                  onToChange={setMeasureTo}
                  onRoutesChange={setMeasureRoutes}
                />
              )}
              {tab === 'summary' && (
                <SummaryPanel trip={trip} reloadKey={summaryKey} canWrite={writable} onUpdateTrip={saveTrip} onDeleteTrip={removeTrip} />
              )}
            </>
          )}
        </aside>

        <main className="trip-map-wrap">
          <TripMap
            places={places}
            stopNumbers={stopNumbers}
            selectedId={selectedId}
            onSelect={setSelectedId}
            picking={picking}
            onPick={handlePick}
            draft={formOpen ? draft : null}
            routes={routes}
            fitSignal={fitSignal}
            focus={focus}
          />
          {picking && <div className="map-banner">Pulsa en el mapa para elegir la ubicación</div>}
          <button className="map-fit-btn" onClick={() => setFitSignal((n) => n + 1)} title="Ver todos los lugares">Ver todo</button>
        </main>
      </div>
    </div>
  );
}
