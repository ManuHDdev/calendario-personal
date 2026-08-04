import { useState, useCallback, useEffect } from 'react';
import { deleteSpot } from '../services/api';
import type { SpotDetail } from '../types';
import './SpotPanel.css';

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function googleMapsDirectionsUrl(fromLat: number, fromLng: number, toLat: number, toLng: number): string {
  return `https://www.google.com/maps/dir/${fromLat},${fromLng}/${toLat},${toLng}`;
}

function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/@${lat},${lng},15z`;
}

const CATEGORY_LABELS: Record<string, string> = {
  piscina: 'Piscina natural',
  ruta: 'Ruta',
  playa: 'Playa',
};

const CATEGORY_COLORS: Record<string, string> = {
  piscina: 'var(--piscina)',
  ruta: 'var(--ruta)',
  playa: 'var(--playa)',
};

interface Props {
  spot: SpotDetail;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

type OriginMode = 'idle' | 'locating' | 'located' | 'error';

export default function SpotPanel({ spot, isAdmin, onClose, onEdit, onDelete }: Props) {
  const [originMode, setOriginMode] = useState<OriginMode>('idle');
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const calculateFromLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setOriginMode('error');
      return;
    }
    setOriginMode('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setOrigin({ lat, lng });
        setDistance(haversineKm(lat, lng, spot.latitud, spot.longitud));
        setOriginMode('located');
      },
      () => setOriginMode('error'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [spot]);

  const handleDelete = async () => {
    if (!confirm('¿Eliminar este spot?')) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteSpot(spot.id);
      onDelete();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Error al eliminar');
      setDeleting(false);
    }
  };

  const resetDistance = () => {
    setOrigin(null);
    setDistance(null);
    setOriginMode('idle');
  };

  return (
    <div className="spot-panel">
      <div className="panel-header">
        <div>
          <span className="panel-category" style={{ color: CATEGORY_COLORS[spot.categoria] }}>
            {CATEGORY_LABELS[spot.categoria]}
          </span>
          <h2 className="panel-title">{spot.nombre}</h2>
          {spot.region && (
            <p className="panel-region">
              {spot.region}
              {spot.provincia ? ` · ${spot.provincia}` : ''}
            </p>
          )}
        </div>
        <button className="panel-close" onClick={onClose} title="Cerrar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {spot.imagen_url && (
        <a href={spot.imagen_url} target="_blank" rel="noopener noreferrer" className="panel-image-link">
          <img
            src={spot.imagen_url}
            alt={spot.nombre}
            className="panel-image"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </a>
      )}

      {spot.descripcion && (
        <div className="panel-description">
          <p>{spot.descripcion}</p>
        </div>
      )}

      <div className="panel-coords">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          <circle cx="12" cy="9" r="2.5"/>
        </svg>
        <span>{spot.latitud.toFixed(4)}, {spot.longitud.toFixed(4)}</span>
      </div>

      <div className="panel-section">
        <h3 className="panel-section-title">Distancia y navegación</h3>

        {originMode === 'idle' && (
          <button className="panel-action-btn" onClick={calculateFromLocation}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="3"/>
              <line x1="12" y1="2" x2="12" y2="6"/>
              <line x1="12" y1="18" x2="12" y2="22"/>
              <line x1="2" y1="12" x2="6" y2="12"/>
              <line x1="18" y1="12" x2="22" y2="12"/>
            </svg>
            Calcular desde mi ubicación
          </button>
        )}

        {originMode === 'locating' && (
          <div className="panel-locating">
            <div className="loading-spinner loading-spinner--small" />
            <span>Obteniendo ubicación...</span>
          </div>
        )}

        {originMode === 'error' && (
          <div className="panel-error-inline">
            <p>No se pudo obtener la ubicación.</p>
            <button className="panel-action-btn panel-action-btn--small" onClick={calculateFromLocation}>
              Reintentar
            </button>
          </div>
        )}

        {originMode === 'located' && distance !== null && origin && (
          <div className="panel-distance-result">
            <div className="distance-value">
              <span className="distance-number">{distance < 1 ? distance.toFixed(2) : distance.toFixed(1)}</span>
              <span className="distance-unit">km</span>
              <span className="distance-label">en línea recta</span>
            </div>
            <a
              href={googleMapsDirectionsUrl(origin.lat, origin.lng, spot.latitud, spot.longitud)}
              target="_blank"
              rel="noopener noreferrer"
              className="panel-maps-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
              Abrir ruta en Google Maps
            </a>
            <button className="panel-text-btn" onClick={resetDistance}>
              Recalcular
            </button>
          </div>
        )}
      </div>

      {spot.parking && (
        <div className="panel-section panel-parking">
          <h3 className="panel-section-title">Aparcamiento</h3>
          <div className="panel-coords" style={{ padding: '0 0 8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>
            </svg>
            <span>{spot.parking.latitud.toFixed(4)}, {spot.parking.longitud.toFixed(4)}</span>
          </div>
          {spot.parking.descripcion && (
            <p className="parking-description">{spot.parking.descripcion}</p>
          )}
          <div className="parking-actions">
            <a
              href={googleMapsUrl(spot.parking.latitud, spot.parking.longitud)}
              target="_blank"
              rel="noopener noreferrer"
              className="panel-action-btn panel-action-btn--outline panel-action-btn--small"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Ver aparcamiento en Maps
            </a>
            {origin && (
              <a
                href={googleMapsDirectionsUrl(origin.lat, origin.lng, spot.parking.latitud, spot.parking.longitud)}
                target="_blank"
                rel="noopener noreferrer"
                className="panel-maps-btn panel-action-btn--small"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
                Llegar al aparcamiento
              </a>
            )}
          </div>
        </div>
      )}

      <div className="panel-section">
        <a
          href={googleMapsUrl(spot.latitud, spot.longitud)}
          target="_blank"
          rel="noopener noreferrer"
          className="panel-action-btn panel-action-btn--outline"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          Ver en Google Maps
        </a>
      </div>

      {isAdmin && (
        <div className="panel-admin">
          {deleteError && <p className="panel-error-inline" style={{ marginBottom: 8 }}>{deleteError}</p>}
          <button className="panel-admin-btn" onClick={onEdit}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Editar
          </button>
          <button className="panel-admin-btn panel-admin-btn--danger" onClick={handleDelete} disabled={deleting}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            {deleting ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      )}
    </div>
  );
}
