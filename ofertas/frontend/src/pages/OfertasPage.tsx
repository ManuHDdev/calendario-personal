import { useState, useEffect, useCallback } from 'react';
import keycloak from '../services/keycloak';
import AppLauncher from '../components/AppLauncher';
import ThemeToggle from '../components/ThemeToggle';
import SearchForm from '../components/SearchForm';
import SearchList from '../components/SearchList';
import { getSearches, createSearch, updateSearch, deleteSearch, getScraperState, updateScraperState } from '../services/api';
import type { Busqueda, BusquedaFormData } from '../types';
import './OfertasPage.css';

export default function OfertasPage() {
  const [searches, setSearches] = useState<Busqueda[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scraperRunning, setScraperRunning] = useState<boolean | null>(null);
  const [scraperToggling, setScraperToggling] = useState(false);

  const username = (keycloak.tokenParsed as { preferred_username?: string })?.preferred_username ?? 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSearches(await getSearches());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar las búsquedas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadScraperState = useCallback(async () => {
    try {
      const state = await getScraperState();
      setScraperRunning(state.running);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el estado del scraper');
    }
  }, []);

  useEffect(() => { void loadScraperState(); }, [loadScraperState]);

  const handleToggleScraper = async () => {
    if (scraperRunning === null) return;
    setScraperToggling(true);
    try {
      const state = await updateScraperState(!scraperRunning);
      setScraperRunning(state.running);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar el estado del scraper');
    } finally {
      setScraperToggling(false);
    }
  };

  const handleCreate = async (data: BusquedaFormData) => {
    await createSearch(data);
    await load();
  };

  const handleUpdate = async (id: string, data: BusquedaFormData) => {
    await updateSearch(id, data);
    await load();
  };

  const handleDelete = async (id: string) => {
    await deleteSearch(id);
    await load();
  };

  const handleToggleHabilitada = async (id: string, habilitada: boolean) => {
    await updateSearch(id, { habilitada });
    await load();
  };

  return (
    <div className="ofertas-layout">
      <header className="ofertas-header">
        <div className="ofertas-header-left">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#bf5af2" strokeWidth="1.8">
            <path d="M20.59 13.41 12 22l-9-9V3h10l7.59 7.59a2 2 0 0 1 0 2.82z"/>
            <circle cx="7.5" cy="7.5" r="1.5" fill="#bf5af2" stroke="none"/>
          </svg>
          <h1 className="ofertas-title">Ofertas</h1>
        </div>
        <div className="ofertas-header-right">
          <ThemeToggle />
          <AppLauncher />
          <span className="ofertas-username">{username}</span>
          <button className="ofertas-logout-btn" onClick={() => keycloak.logout()}>Salir</button>
        </div>
      </header>

      <main className="ofertas-main">
        {error && <div className="ofertas-error">{error}</div>}

        <section className="ofertas-section scraper-toggle-section">
          <div className="scraper-toggle">
            <span className={`scraper-status ${scraperRunning ? 'scraper-status--on' : 'scraper-status--off'}`}>
              Scraper: {scraperRunning === null ? '…' : scraperRunning ? 'Activo' : 'Pausado'}
            </span>
            <button
              className="btn-secondary"
              onClick={() => void handleToggleScraper()}
              disabled={scraperRunning === null || scraperToggling}
            >
              {scraperToggling ? 'Guardando…' : scraperRunning ? 'Pausar' : 'Reanudar'}
            </button>
          </div>
        </section>

        <section className="ofertas-section">
          <h2 className="ofertas-section-title">Añadir búsqueda</h2>
          <SearchForm onSubmit={handleCreate} />
        </section>

        <section className="ofertas-section">
          <h2 className="ofertas-section-title">
            Búsquedas guardadas{searches.length > 0 ? ` (${searches.length})` : ''}
          </h2>
          {/*
            Solo se sustituye la lista por "Cargando…" en la carga inicial
            (sin datos todavía). En recargas posteriores (tras crear/editar/
            pausar/borrar una búsqueda, `load()` vuelve a poner loading=true)
            se mantiene <SearchList> montada con los datos previos mientras
            llega la respuesta: desmontarla aquí colapsaba el alto de la
            página durante el fetch y el navegador clampaba el scroll al
            nuevo `scrollHeight` más corto, lo que se percibía como "la
            página se recarga y vuelve arriba" al editar cualquier búsqueda.
          */}
          {loading && searches.length === 0 ? (
            <p className="empty-hint">Cargando…</p>
          ) : (
            <SearchList
              searches={searches}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onToggleHabilitada={handleToggleHabilitada}
            />
          )}
        </section>
      </main>
    </div>
  );
}
