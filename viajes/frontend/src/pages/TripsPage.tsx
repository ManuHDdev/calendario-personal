import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import keycloak, { canWrite } from '../services/keycloak';
import AppLauncher from '../components/AppLauncher';
import ThemeToggle from '../components/ThemeToggle';
import { ApiError, createTrip, listTrips } from '../services/api';
import { formatDate } from '../lib/format';
import type { TripSummaryItem } from '../types';

export default function TripsPage() {
  const navigate = useNavigate();
  const writable = canWrite();
  const username = (keycloak.tokenParsed as { preferred_username?: string })?.preferred_username ?? '';

  const [trips, setTrips] = useState<TripSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTrips(await listTrips());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al cargar los viajes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (startDate && endDate && endDate < startDate) {
      setError('La vuelta no puede ser anterior a la ida.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const trip = await createTrip({ name: name.trim(), startDate: startDate || null, endDate: endDate || null });
      navigate(`/trips/${trip.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al crear el viaje');
      setCreating(false);
    }
  };

  return (
    <div className="viajes-layout">
      <header className="viajes-header">
        <div className="viajes-header-left">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="1.8" aria-hidden="true">
            <rect x="3" y="7" width="18" height="13" rx="2" />
            <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            <line x1="3" y1="13" x2="21" y2="13" />
          </svg>
          <h1 className="viajes-title">Viajes</h1>
        </div>
        <div className="viajes-header-right">
          <ThemeToggle />
          <AppLauncher />
          {username && <span className="viajes-username">{username}</span>}
          <button className="viajes-logout-btn" onClick={() => keycloak.logout()}>Salir</button>
        </div>
      </header>

      <main className="viajes-main">
        {error && <div className="form-error" role="alert">{error}</div>}

        {writable && (
          <section>
            <h2 className="section-title">Nuevo viaje</h2>
            <form className="trip-create-form" onSubmit={handleCreate}>
              <input type="text" placeholder="Nombre (p. ej. Ruta por Portugal)" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required aria-label="Nombre del viaje" />
              <label className="inline-date">Ida <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
              <label className="inline-date">Vuelta <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} /></label>
              <button type="submit" className="btn-primary" disabled={creating}>{creating ? 'Creando…' : 'Crear viaje'}</button>
            </form>
          </section>
        )}

        <section>
          <h2 className="section-title">Tus viajes</h2>
          {loading ? (
            <p className="empty-hint">Cargando…</p>
          ) : trips.length === 0 ? (
            <p className="empty-hint">Todavía no hay ningún viaje.</p>
          ) : (
            <ul className="trip-list">
              {trips.map((t) => (
                <li key={t.id}>
                  <button className="trip-list-item" onClick={() => navigate(`/trips/${t.id}`)}>
                    <span className="trip-list-main">
                      <span className="trip-list-name">{t.name}</span>
                      <span className="trip-list-sub">
                        {t.startDate || t.endDate
                          ? `${t.startDate ? formatDate(t.startDate) : '?'} → ${t.endDate ? formatDate(t.endDate) : '?'} · `
                          : ''}
                        {t.placeCount} lugar{t.placeCount === 1 ? '' : 'es'}
                      </span>
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
