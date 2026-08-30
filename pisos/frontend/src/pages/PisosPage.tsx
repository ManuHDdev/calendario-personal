import { useState, useEffect, useCallback } from 'react';
import keycloak from '../services/keycloak';
import AppLauncher from '../components/AppLauncher';
import ThemeToggle from '../components/ThemeToggle';
import BusquedaForm from '../components/BusquedaForm';
import BusquedaList from '../components/BusquedaList';
import AnuncioList from '../components/AnuncioList';
import {
  getSearches,
  createSearch,
  updateSearch,
  deleteSearch,
  rastrearAhora,
  getListings,
  updateListing,
  marcarTodosVistos,
  getScraperState,
  updateScraperState,
} from '../services/api';
import type { Anuncio, Busqueda, BusquedaFormData } from '../types';
import './PisosPage.css';

type Pestana = 'anuncios' | 'busquedas';

export default function PisosPage() {
  const [pestana, setPestana] = useState<Pestana>('anuncios');
  const [busquedas, setBusquedas] = useState<Busqueda[]>([]);
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [soloNuevos, setSoloNuevos] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [scraperRunning, setScraperRunning] = useState<boolean | null>(null);
  const [cambiandoScraper, setCambiandoScraper] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);

  const username =
    (keycloak.tokenParsed as { preferred_username?: string })?.preferred_username ?? 'admin';

  const cargarBusquedas = useCallback(async () => {
    try {
      setBusquedas(await getSearches());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar las búsquedas');
    }
  }, []);

  const cargarAnuncios = useCallback(async () => {
    try {
      setAnuncios(
        await getListings({ busqueda: filtroBusqueda || undefined, soloNuevos }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar los anuncios');
    }
  }, [filtroBusqueda, soloNuevos]);

  useEffect(() => {
    void (async () => {
      setCargando(true);
      await Promise.all([cargarBusquedas(), cargarAnuncios()]);
      setCargando(false);
    })();
    // Solo en el montaje: los recargas posteriores los disparan los efectos
    // de abajo, que sí dependen de los filtros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void cargarAnuncios(); }, [cargarAnuncios]);

  useEffect(() => {
    void (async () => {
      try {
        setScraperRunning((await getScraperState()).running);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al leer el estado del rastreador');
      }
    })();
  }, []);

  const handleToggleScraper = async () => {
    if (scraperRunning === null) return;
    setCambiandoScraper(true);
    try {
      setScraperRunning((await updateScraperState(!scraperRunning)).running);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar el estado del rastreador');
    } finally {
      setCambiandoScraper(false);
    }
  };

  const handleCrear = async (data: BusquedaFormData) => {
    await createSearch(data);
    setMostrarForm(false);
    await cargarBusquedas();
  };

  const handleActualizar = async (id: string, data: BusquedaFormData) => {
    await updateSearch(id, data);
    await cargarBusquedas();
  };

  const handleBorrar = async (id: string) => {
    await deleteSearch(id);
    await Promise.all([cargarBusquedas(), cargarAnuncios()]);
  };

  const handleRastrear = async (id: string) => {
    const resultado = await rastrearAhora(id);
    await Promise.all([cargarBusquedas(), cargarAnuncios()]);
    return resultado;
  };

  // Se actualiza la fila en memoria en vez de recargar la lista entera: al
  // marcar "visto" con el filtro de nuevos puesto, recargar haría que la
  // tarjeta desapareciera de golpe bajo el cursor.
  const handleMarcarVisto = async (id: string) => {
    await updateListing(id, { visto: true });
    setAnuncios((prev) => prev.map((a) => (a.id === id ? { ...a, visto: true } : a)));
  };

  const handleDescartar = async (id: string) => {
    await updateListing(id, { descartado: true, visto: true });
    setAnuncios((prev) => prev.filter((a) => a.id !== id));
  };

  const handleMarcarTodos = async () => {
    await marcarTodosVistos(filtroBusqueda || undefined);
    await cargarAnuncios();
  };

  const sinVer = anuncios.filter((a) => !a.visto).length;

  return (
    <div className="pisos-layout">
      <header className="pisos-header">
        <div className="pisos-header-left">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7cb518" strokeWidth="1.8">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.8V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.8" />
            <rect x="9.5" y="13" width="5" height="8" />
          </svg>
          <h1 className="pisos-title">Pisos</h1>
        </div>
        <div className="pisos-header-right">
          <ThemeToggle />
          <AppLauncher />
          <span className="pisos-username">{username}</span>
          <button className="pisos-logout-btn" onClick={() => keycloak.logout()}>Salir</button>
        </div>
      </header>

      <main className="pisos-main">
        {error && <div className="pisos-error" onClick={() => setError('')}>{error}</div>}

        <section className="pisos-barra">
          <div className="pestanas">
            <button
              className={`pestana${pestana === 'anuncios' ? ' pestana--activa' : ''}`}
              onClick={() => setPestana('anuncios')}
            >
              Anuncios{sinVer > 0 ? ` (${sinVer} sin ver)` : ''}
            </button>
            <button
              className={`pestana${pestana === 'busquedas' ? ' pestana--activa' : ''}`}
              onClick={() => setPestana('busquedas')}
            >
              Búsquedas ({busquedas.length})
            </button>
          </div>

          <div className="scraper-toggle">
            <span className={`scraper-status ${scraperRunning ? 'scraper-status--on' : 'scraper-status--off'}`}>
              Rastreador: {scraperRunning === null ? '…' : scraperRunning ? 'Activo' : 'Pausado'}
            </span>
            <button
              className="btn-secondary"
              onClick={() => void handleToggleScraper()}
              disabled={scraperRunning === null || cambiandoScraper}
            >
              {cambiandoScraper ? 'Guardando…' : scraperRunning ? 'Pausar' : 'Reanudar'}
            </button>
          </div>
        </section>

        {pestana === 'anuncios' ? (
          <>
            <section className="pisos-filtros">
              <select value={filtroBusqueda} onChange={(e) => setFiltroBusqueda(e.target.value)}>
                <option value="">Todas las búsquedas</option>
                {busquedas.map((b) => (
                  <option key={b.id} value={b.id}>{b.nombre}</option>
                ))}
              </select>
              <label className={`chip${soloNuevos ? ' chip--on' : ''}`}>
                <input type="checkbox" checked={soloNuevos} onChange={() => setSoloNuevos((v) => !v)} />
                Solo sin ver
              </label>
              <button className="btn-secondary" onClick={() => void handleMarcarTodos()} disabled={sinVer === 0}>
                Marcar todo como visto
              </button>
            </section>

            {cargando ? (
              <p className="empty-hint">Cargando…</p>
            ) : (
              <AnuncioList
                anuncios={anuncios}
                onMarcarVisto={handleMarcarVisto}
                onDescartar={handleDescartar}
              />
            )}
          </>
        ) : (
          <>
            <section className="pisos-section">
              {mostrarForm ? (
                <BusquedaForm onSubmit={handleCrear} onCancel={() => setMostrarForm(false)} />
              ) : (
                <button className="btn-primary" onClick={() => setMostrarForm(true)}>
                  Nueva búsqueda
                </button>
              )}
            </section>

            <section className="pisos-section">
              <BusquedaList
                busquedas={busquedas}
                onUpdate={handleActualizar}
                onDelete={handleBorrar}
                onToggleHabilitada={async (id, habilitada) => {
                  await updateSearch(id, { habilitada });
                  await cargarBusquedas();
                }}
                onRastrear={handleRastrear}
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
