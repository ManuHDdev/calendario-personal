import { useState, useEffect, useCallback } from 'react';
import keycloak from '../services/keycloak';
import AppLauncher from '../components/AppLauncher';
import ThemeToggle from '../components/ThemeToggle';
import RouteMap from '../components/RouteMap';
import ResultsPanel from '../components/ResultsPanel';
import SearchForm, { EMPTY_FORM, type SearchFormValues } from '../components/SearchForm';
import {
  searchAlongRoute,
  getSavedSearches,
  createSavedSearch,
  deleteSavedSearch,
} from '../services/api';
import type { CorridorListing, RouteSearchRequest, RouteSearchResult, SavedRouteSearch } from '../types';
import './RutaPage.css';

export default function RutaPage() {
  const [form, setForm] = useState<SearchFormValues>(EMPTY_FORM);
  const [result, setResult] = useState<RouteSearchResult | null>(null);
  const [selected, setSelected] = useState<CorridorListing | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedRouteSearch[]>([]);
  const [showCoverage, setShowCoverage] = useState(false);
  // The detour that produced the CURRENT results, which is not necessarily the
  // one in the form any more once the user starts editing.
  const [resultDetourKm, setResultDetourKm] = useState(EMPTY_FORM.desvioMaxKm);

  const roles: string[] =
    (keycloak.tokenParsed as { realm_access?: { roles?: string[] } })?.realm_access?.roles ?? [];
  const isAdmin = roles.includes('admin');

  const refreshSaved = useCallback(async () => {
    try {
      setSaved(await getSavedSearches());
    } catch {
      // A failure to list saved searches must not block the actual feature.
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void refreshSaved();
  }, [isAdmin, refreshSaved]);

  async function handleSearch(request: RouteSearchRequest) {
    setSearching(true);
    setError(null);
    setSelected(null);
    try {
      const found = await searchAlongRoute(request);
      setResult(found);
      setResultDetourKm(request.desvio_max_km);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La busqueda fallo');
      setResult(null);
    } finally {
      setSearching(false);
    }
  }

  async function handleSave(
    request: RouteSearchRequest,
    resolved: { origen: string; destino: string },
  ) {
    setError(null);
    try {
      // Name it after what Nominatim actually resolved, not the raw typing:
      // "Madrid" is ambiguous in a saved list, "Madrid, Comunidad de Madrid"
      // is not. Only the leading part is kept, since the full display name is
      // a long administrative chain.
      const shortName = (place: string) => place.split(',').slice(0, 2).join(',').trim();

      await createSavedSearch({
        nombre: `${form.keyword} · ${shortName(resolved.origen)} → ${shortName(resolved.destino)}`,
        origen_texto: form.origenTexto,
        origen_lat: request.origen.lat,
        origen_lng: request.origen.lng,
        destino_texto: form.destinoTexto,
        destino_lat: request.destino.lat,
        destino_lng: request.destino.lng,
        keyword: request.keyword,
        desvio_max_km: request.desvio_max_km,
        min_price: request.min_price ?? null,
        max_price: request.max_price ?? null,
        excluir_palabras: request.excluir_palabras ?? null,
      });
      await refreshSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la busqueda');
    }
  }

  /** Re-runs a saved search directly, without going back through geocoding. */
  async function runSaved(entry: SavedRouteSearch) {
    setForm({
      origenTexto: entry.origen_texto,
      destinoTexto: entry.destino_texto,
      keyword: entry.keyword,
      desvioMaxKm: entry.desvio_max_km,
      minPrice: entry.min_price === null ? '' : String(entry.min_price),
      maxPrice: entry.max_price === null ? '' : String(entry.max_price),
      excluirPalabras: entry.excluir_palabras ?? '',
    });

    await handleSearch({
      origen: { lat: entry.origen_lat, lng: entry.origen_lng },
      destino: { lat: entry.destino_lat, lng: entry.destino_lng },
      keyword: entry.keyword,
      desvio_max_km: entry.desvio_max_km,
      min_price: entry.min_price,
      max_price: entry.max_price,
      excluir_palabras: entry.excluir_palabras,
    });
  }

  async function removeSaved(id: number) {
    try {
      await deleteSavedSearch(id);
      await refreshSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar la busqueda');
    }
  }

  if (!keycloak.authenticated) {
    return (
      <div className="ruta-gate">
        <h1>Ruta</h1>
        <p>Inicia sesion para buscar por el camino.</p>
        <button className="ruta-btn ruta-btn--primary" onClick={() => keycloak.login()}>
          Iniciar sesion
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="ruta-gate">
        <h1>Ruta</h1>
        <p>No tienes acceso a esta aplicacion.</p>
      </div>
    );
  }

  return (
    <div className="ruta-page">
      <header className="ruta-header">
        <div className="ruta-header__left">
          <AppLauncher />
          <h1>Ruta</h1>
          <span className="ruta-header__tag">Wallapop por el camino</span>
        </div>
        <div className="ruta-header__right">
          <label className="ruta-toggle">
            <input
              type="checkbox"
              checked={showCoverage}
              onChange={(e) => setShowCoverage(e.target.checked)}
            />
            Ver cobertura
          </label>
          <ThemeToggle />
          <button className="ruta-btn" onClick={() => keycloak.logout()}>
            Salir
          </button>
        </div>
      </header>

      <div className="ruta-body">
        <aside className="ruta-sidebar">
          <SearchForm
            values={form}
            onChange={setForm}
            onSearch={handleSearch}
            onSave={handleSave}
            searching={searching}
          />

          {error && <p className="ruta-form__error">{error}</p>}

          {saved.length > 0 && (
            <section className="ruta-saved">
              <h2>Guardadas</h2>
              <ul>
                {saved.map((entry) => (
                  <li key={entry.id}>
                    <button type="button" className="ruta-saved__run" onClick={() => runSaved(entry)}>
                      <strong>{entry.keyword}</strong>
                      <span>
                        {entry.origen_texto} → {entry.destino_texto} · {entry.desvio_max_km} km
                      </span>
                    </button>
                    <button
                      type="button"
                      className="ruta-saved__delete"
                      onClick={() => removeSaved(entry.id)}
                      aria-label={`Borrar ${entry.nombre}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ResultsPanel
            result={result}
            maxDetourKm={resultDetourKm}
            selected={selected}
            onSelect={setSelected}
            searching={searching}
          />
        </aside>

        <main className="ruta-main">
          <RouteMap
            result={result}
            maxDetourKm={resultDetourKm}
            selected={selected}
            onSelect={setSelected}
            showCoverage={showCoverage}
          />
        </main>
      </div>
    </div>
  );
}
