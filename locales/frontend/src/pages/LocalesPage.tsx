import { useState, useEffect, useCallback } from 'react';
import keycloak from '../services/keycloak';
import AppLauncher from '../components/AppLauncher';
import ThemeToggle from '../components/ThemeToggle';
import BusquedaForm from '../components/BusquedaForm';
import BusquedaList from '../components/BusquedaList';
import AnuncioList from '../components/AnuncioList';
import PanelComprobacion from '../components/PanelComprobacion';
import VistaNormativa from '../components/VistaNormativa';
import VistaCobertura from '../components/VistaCobertura';
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
import type { Anuncio, Busqueda, BusquedaFormData, TipoBusqueda, Veredicto } from '../types';
import './LocalesPage.css';

type Pestana = 'anuncios' | 'busquedas' | 'comprobar' | 'normativa' | 'cobertura';

export default function LocalesPage() {
  const [pestana, setPestana] = useState<Pestana>('anuncios');
  const [busquedas, setBusquedas] = useState<Busqueda[]>([]);
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'' | TipoBusqueda>('');
  const [filtroVeredicto, setFiltroVeredicto] = useState<'' | Veredicto>('');
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
        await getListings({
          busqueda: filtroBusqueda ? Number(filtroBusqueda) : undefined,
          tipo: filtroTipo || undefined,
          veredicto: filtroVeredicto || undefined,
          soloNuevos,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar los anuncios');
    }
  }, [filtroBusqueda, filtroTipo, filtroVeredicto, soloNuevos]);

  useEffect(() => {
    void (async () => {
      setCargando(true);
      await Promise.all([cargarBusquedas(), cargarAnuncios()]);
      setCargando(false);
    })();
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

  const handleActualizar = async (id: number, data: BusquedaFormData) => {
    await updateSearch(id, data);
    await cargarBusquedas();
  };

  const handleBorrar = async (id: number) => {
    await deleteSearch(id);
    await Promise.all([cargarBusquedas(), cargarAnuncios()]);
  };

  const handleRastrear = async (id: number) => {
    const resultado = await rastrearAhora(id);
    await Promise.all([cargarBusquedas(), cargarAnuncios()]);
    return resultado;
  };

  // Fila actualizada en memoria: recargar haría desaparecer la tarjeta bajo el
  // cursor cuando está puesto el filtro de "solo sin ver".
  const handleMarcarVisto = async (id: number) => {
    await updateListing(id, { visto: true });
    setAnuncios((prev) => prev.map((a) => (a.id === id ? { ...a, visto: true } : a)));
  };

  const handleDescartar = async (id: number) => {
    await updateListing(id, { descartado: true, visto: true });
    setAnuncios((prev) => prev.filter((a) => a.id !== id));
  };

  const handleMarcarTodos = async () => {
    await marcarTodosVistos(filtroBusqueda ? Number(filtroBusqueda) : undefined);
    await cargarAnuncios();
  };

  const sinVer = anuncios.filter((a) => !a.visto).length;

  const errorRastreo = filtroBusqueda
    ? busquedas.find((b) => String(b.id) === filtroBusqueda)?.ultimo_rastreo_error ?? null
    : busquedas
        .filter((b) => b.ultimo_rastreo_error)
        .map((b) => `${b.nombre}: ${b.ultimo_rastreo_error}`)
        .join(' | ') || null;

  const TABS: Array<[Pestana, string]> = [
    ['anuncios', `Anuncios${sinVer > 0 ? ` (${sinVer} sin ver)` : ''}`],
    ['busquedas', `Búsquedas (${busquedas.length})`],
    ['comprobar', 'Comprobar'],
    ['normativa', 'Normativa'],
    ['cobertura', 'Cobertura del padrón'],
  ];

  return (
    <div className="locales-layout">
      <header className="locales-header">
        <div className="locales-header-left">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c97b3c" strokeWidth="1.8">
            <path d="M4 9h16l-1.2-4.2A1 1 0 0 0 17.8 4H6.2a1 1 0 0 0-1 .8L4 9z" />
            <path d="M5 9v10.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
            <path d="M9.5 20.5V15h5v5.5" />
          </svg>
          <h1 className="locales-title">Locales</h1>
        </div>
        <div className="locales-header-right">
          <ThemeToggle />
          <AppLauncher />
          <span className="locales-username">{username}</span>
          <button className="locales-logout-btn" onClick={() => keycloak.logout()}>Salir</button>
        </div>
      </header>

      <main className="locales-main">
        {error && <div className="locales-error" onClick={() => setError('')}>{error}</div>}

        <section className="locales-barra">
          <div className="pestanas">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                className={`pestana${pestana === id ? ' pestana--activa' : ''}`}
                onClick={() => setPestana(id)}
              >
                {label}
              </button>
            ))}
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

        {pestana === 'anuncios' && (
          <>
            <section className="locales-filtros">
              <select value={filtroBusqueda} onChange={(e) => setFiltroBusqueda(e.target.value)}>
                <option value="">Todas las búsquedas</option>
                {busquedas.map((b) => (
                  <option key={b.id} value={b.id}>{b.nombre}</option>
                ))}
              </select>
              <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as '' | TipoBusqueda)}>
                <option value="">Local y farmacia</option>
                <option value="local">Local</option>
                <option value="farmacia">Farmacia</option>
              </select>
              <select value={filtroVeredicto} onChange={(e) => setFiltroVeredicto(e.target.value as '' | Veredicto)}>
                <option value="">Cualquier veredicto</option>
                <option value="verde">🟢 Verde</option>
                <option value="ambar">🟡 Ámbar</option>
                <option value="rojo">🔴 Rojo</option>
                <option value="sin_datos">⚪ Sin datos</option>
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
                ultimoRastreoError={errorRastreo}
                onMarcarVisto={handleMarcarVisto}
                onDescartar={handleDescartar}
              />
            )}
          </>
        )}

        {pestana === 'busquedas' && (
          <>
            <section className="locales-section">
              {mostrarForm ? (
                <BusquedaForm onSubmit={handleCrear} onCancel={() => setMostrarForm(false)} />
              ) : (
                <button className="btn-primary" onClick={() => setMostrarForm(true)}>Nueva búsqueda</button>
              )}
            </section>
            <section className="locales-section">
              <BusquedaList
                busquedas={busquedas}
                onUpdate={handleActualizar}
                onDelete={handleBorrar}
                onRastrear={handleRastrear}
                onTogglePar={async (id, campo, valor, tipo) => {
                  await updateSearch(id, { tipo, [campo]: valor });
                  await cargarBusquedas();
                }}
              />
            </section>
          </>
        )}

        {pestana === 'comprobar' && <PanelComprobacion />}
        {pestana === 'normativa' && <VistaNormativa />}
        {pestana === 'cobertura' && <VistaCobertura />}
      </main>
    </div>
  );
}
