import { useState, useEffect, useCallback } from 'react';
import keycloak from '../services/keycloak';
import { getSpots, getStats, getSpotDetail } from '../services/api';
import SpotMap from '../components/SpotMap';
import SpotPanel from '../components/SpotPanel';
import SpotFormModal from '../components/SpotFormModal';
import AppLauncher from '../components/AppLauncher';
import type { Spot, SpotStats, SpotDetail } from '../types';
import './ParaisosPage.css';

type Categoria = 'todo' | 'piscina' | 'ruta' | 'playa';

export default function ParaisosPage() {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [stats, setStats] = useState<SpotStats>({ piscinas: 0, rutas: 0, playas: 0 });
  const [categoria, setCategoria] = useState<Categoria>('todo');
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [spotDetail, setSpotDetail] = useState<SpotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSpot, setEditingSpot] = useState<Spot | null>(null);
  const [pickingMode, setPickingMode] = useState<'spot' | 'parking' | null>(null);
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pendingParkingCoords, setPendingParkingCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pendingLocationCoords, setPendingLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [createSpotMode, setCreateSpotMode] = useState(false);
  const [measurePin, setMeasurePin] = useState<{ lat: number; lng: number } | null>(null);

  const roles = (keycloak.tokenParsed as { realm_access?: { roles?: string[] } })
    ?.realm_access?.roles ?? [];
  const isAdmin = keycloak.authenticated &&
    (roles.includes('admin') || roles.includes('paraisos_admin'));

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const filter = categoria === 'todo' ? undefined : categoria;
      const [spotsData, statsData] = await Promise.all([
        getSpots(filter),
        getStats(),
      ]);
      setSpots(spotsData);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading data');
    } finally {
      setLoading(false);
    }
  }, [categoria]);

  useEffect(() => { loadData(); }, [loadData]);

  // Fetch spot detail when a spot is selected
  useEffect(() => {
    if (selectedSpot) {
      getSpotDetail(selectedSpot.id).then(setSpotDetail).catch(() => setSpotDetail(null));
    } else {
      setSpotDetail(null);
    }
  }, [selectedSpot]);

  const handleSpotCreated = () => {
    setShowForm(false);
    setEditingSpot(null);
    setPendingCoords(null);
    setPendingParkingCoords(null);
    setPendingLocationCoords(null);
    loadData();
  };

  const handleEdit = (spot: Spot) => {
    setEditingSpot(spot);
    setShowForm(true);
  };

  const handleDelete = () => {
    setSelectedSpot(null);
    loadData();
  };

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (pickingMode === 'parking') {
      setPendingParkingCoords({ lat, lng });
      setPickingMode(null);
      return;
    }
    if (pickingMode === 'spot') {
      setPendingLocationCoords({ lat, lng });
      setPickingMode(null);
      return;
    }
    if (createSpotMode) {
      setPendingCoords({ lat, lng });
      setEditingSpot(null);
      setShowForm(true);
      setCreateSpotMode(false);
      return;
    }
    // Default: drop/move the reference pin
    setMeasurePin({ lat, lng });
  }, [createSpotMode, pickingMode]);

  const handlePickFromMap = useCallback((target: 'spot' | 'parking') => {
    setPickingMode(target);
    if (target === 'parking') setPendingParkingCoords(null);
    else setPendingLocationCoords(null);
  }, []);

  const handleFormClose = useCallback(() => {
    setShowForm(false);
    setEditingSpot(null);
    setPendingCoords(null);
    setPendingParkingCoords(null);
    setPendingLocationCoords(null);
    setPickingMode(null);
  }, []);

  const total = stats.piscinas + stats.rutas + stats.playas;

  return (
    <div className="paraisos-layout">
      <header className="paraisos-header">
        <div className="header-left">
          <h1 className="header-title">Paraísos Naturales</h1>
          <span className="header-count">{total} lugares</span>
        </div>

        <nav className="header-filters">
          <button
            className={`filter-pill${categoria === 'todo' ? ' filter-pill--active' : ''}`}
            onClick={() => setCategoria('todo')}
          >
            Todo
          </button>
          <button
            className={`filter-pill filter-pill--piscina${categoria === 'piscina' ? ' filter-pill--active' : ''}`}
            onClick={() => setCategoria('piscina')}
          >
            <span className="filter-dot" style={{ background: 'var(--piscina)' }} />
            Piscinas
            <span className="filter-count">{stats.piscinas}</span>
          </button>
          <button
            className={`filter-pill filter-pill--ruta${categoria === 'ruta' ? ' filter-pill--active' : ''}`}
            onClick={() => setCategoria('ruta')}
          >
            <span className="filter-dot" style={{ background: 'var(--ruta)' }} />
            Rutas
            <span className="filter-count">{stats.rutas}</span>
          </button>
          <button
            className={`filter-pill filter-pill--playa${categoria === 'playa' ? ' filter-pill--active' : ''}`}
            onClick={() => setCategoria('playa')}
          >
            <span className="filter-dot" style={{ background: 'var(--playa)' }} />
            Playas
            <span className="filter-count">{stats.playas}</span>
          </button>
        </nav>

        <div className="header-right">
          {isAdmin && (
            <button
              className="add-spot-btn"
              onClick={() => setCreateSpotMode((v) => !v)}
              title="Nuevo spot"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          )}
          {keycloak.authenticated ? (
            <AppLauncher />
          ) : (
            <button
              type="button"
              className="paraisos-login-link"
              onClick={() => keycloak.login()}
            >
              Iniciar sesión
            </button>
          )}
        </div>
      </header>

      <main className="paraisos-main">
        {loading && (
          <div className="loading-overlay">
            <div className="loading-spinner" />
          </div>
        )}

        {error && (
          <div className="error-banner">
            <p>{error}</p>
            <button onClick={loadData}>Reintentar</button>
          </div>
        )}

        {!loading && spots.length === 0 && !error && (
          <div className="empty-state">No se encontraron spots para esta categoría</div>
        )}

        {pickingMode && (
          <div className="picking-banner">
            <span>Haz clic en el mapa para seleccionar la ubicación</span>
            <button onClick={() => setPickingMode(null)}>Cancelar</button>
          </div>
        )}

        {createSpotMode && (
          <div className="picking-banner">
            <span>Clica en el mapa para crear un spot ahí</span>
            <button onClick={() => setCreateSpotMode(false)}>Cancelar</button>
          </div>
        )}

        {!createSpotMode && measurePin !== null && (
          <div className="picking-banner">
            <span>Pincho colocado — clica un spot para ver la distancia</span>
            <button onClick={() => setMeasurePin(null)}>Quitar pincho</button>
          </div>
        )}

        <SpotMap
          spots={spots}
          selectedSpot={selectedSpot}
          onSpotSelect={setSelectedSpot}
          onMapClick={handleMapClick}
          pickingMode={pickingMode ?? (createSpotMode ? 'create' : null)}
          parkingMarker={spotDetail?.parking ? { lat: spotDetail.parking.latitud, lng: spotDetail.parking.longitud } : null}
          measurePin={measurePin}
        />

        {spotDetail && (
          <SpotPanel
            spot={spotDetail}
            isAdmin={isAdmin}
            onClose={() => setSelectedSpot(null)}
            onEdit={() => handleEdit(spotDetail)}
            onDelete={handleDelete}
            pinOrigin={measurePin}
          />
        )}
      </main>

      {showForm && (
        <SpotFormModal
          spot={editingSpot ? spotDetail : null}
          initialCoords={!editingSpot ? pendingCoords : null}
          pendingLocationCoords={pickingMode === null ? pendingLocationCoords : null}
          pendingParkingCoords={pickingMode === null ? pendingParkingCoords : null}
          hidden={pickingMode !== null}
          onSave={handleSpotCreated}
          onClose={handleFormClose}
          onPickFromMap={handlePickFromMap}
        />
      )}
    </div>
  );
}
