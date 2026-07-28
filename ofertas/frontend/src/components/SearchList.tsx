import { useState } from 'react';
import type { Busqueda, BusquedaFormData, Sitios } from '../types';
import SearchForm from './SearchForm';

interface Props {
  searches: Busqueda[];
  onUpdate: (id: string, data: BusquedaFormData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onToggleHabilitada: (id: string, habilitada: boolean) => Promise<void>;
}

function siteBadges(sitios: Sitios): string {
  return (Object.keys(sitios) as (keyof Sitios)[])
    .filter((site) => sitios[site].enabled)
    .join(', ') || 'ninguno';
}

export default function SearchList({ searches, onUpdate, onDelete, onToggleHabilitada }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  if (searches.length === 0) {
    return <p className="empty-hint">No hay búsquedas guardadas todavía.</p>;
  }

  const handleToggle = async (s: Busqueda) => {
    setTogglingIds((prev) => new Set(prev).add(s.id));
    try {
      await onToggleHabilitada(s.id, !s.habilitada);
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(s.id);
        return next;
      });
    }
  };

  return (
    <div className="search-list">
      {searches.map((s) => (
        <div key={s.id} className={`search-card${s.habilitada ? '' : ' search-card--paused'}`}>
          {editingId === s.id ? (
            <SearchForm
              initial={s}
              onSubmit={async (data) => {
                await onUpdate(s.id, data);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <>
              <div className="search-card-header">
                <h3 className="search-card-title">{s.nombre}</h3>
                <div className="search-card-actions">
                  <button
                    role="switch"
                    aria-checked={s.habilitada}
                    className={`search-toggle-switch${s.habilitada ? ' search-toggle-switch--on' : ''}`}
                    title={s.habilitada ? 'Activa — pulsa para pausar' : 'Pausada — pulsa para activar'}
                    disabled={togglingIds.has(s.id)}
                    onClick={() => void handleToggle(s)}
                  />
                  <button className="tbl-btn" title="Editar" onClick={() => setEditingId(s.id)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M12 20h9"/>
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                    </svg>
                  </button>
                  <button
                    className="tbl-btn tbl-btn--delete"
                    title="Eliminar"
                    onClick={() => {
                      if (window.confirm(`¿Eliminar la búsqueda "${s.nombre}"?`)) {
                        void onDelete(s.id);
                      }
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14H6L5 6"/>
                      <path d="M10 11v6M14 11v6"/>
                      <path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </div>
              </div>
              <p className="search-card-keyword">"{s.keyword}"</p>
              <div className="search-card-meta">
                <span className={`search-status ${s.habilitada ? 'search-status--on' : 'search-status--off'}`}>
                  {s.habilitada ? 'Activa' : 'Pausada'}
                </span>
                <span>
                  {s.precio_min != null ? `${s.precio_min} €` : 'sin mínimo'}
                  {' – '}
                  {s.precio_max != null ? `${s.precio_max} €` : 'sin máximo'}
                </span>
                <span>{s.distance_km} km</span>
                <span>sitios: {siteBadges(s.sitios)}</span>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
