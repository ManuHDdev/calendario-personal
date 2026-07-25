import { useState, useEffect, useRef } from 'react';
import keycloak from '../services/keycloak';
import './AppLauncher.css';

interface AppDef {
  id: string;
  nombre: string;
  color: string;
  roles: string[] | null; // null = visible para todos
}

const APPS: AppDef[] = [
  { id: 'calendario', nombre: 'Calendario', color: '#0071e3', roles: null },
  { id: 'storage',    nombre: 'Storage',    color: '#5e5ce6', roles: ['admin', 'familia'] },
  { id: 'mapacyd',    nombre: 'MapaCYD',    color: '#30d158', roles: ['admin', 'familia'] },
  { id: 'panel',      nombre: 'Panel',      color: '#ff9f0a', roles: ['admin'] },
  { id: 'ytdl',       nombre: 'Ytdl',       color: '#ff375f', roles: null },
  { id: 'gastos',     nombre: 'Gastos',     color: '#ffd60a', roles: ['admin'] },
];

function getUrls(): Record<string, string> {
  const local = window.location.hostname === 'localhost';
  return {
    calendario: local ? 'http://localhost:4200'          : '/',
    storage:    local ? 'http://localhost:5173/storage/' : '/storage/',
    mapacyd:    local ? 'http://localhost:5175/mapacyd/' : '/mapacyd/',
    panel:      local ? 'http://localhost:5174/panel/'   : '/panel/',
    ytdl:       local ? 'http://localhost:5176/ytdl/'    : '/ytdl/',
    gastos:     local ? 'http://localhost:5177/gastos/'  : '/gastos/',
  };
}

function AppIcon({ id }: { id: string }) {
  switch (id) {
    case 'calendario':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="18" rx="3"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
        </svg>
      );
    case 'storage':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        </svg>
      );
    case 'mapacyd':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          <circle cx="12" cy="9" r="2.5"/>
        </svg>
      );
    case 'panel':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      );
    case 'ytdl':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
          <path d="M12 3v12"/>
          <path d="M7 10l5 5 5-5"/>
          <path d="M4 19h16"/>
        </svg>
      );
    case 'gastos':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
          <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
          <path d="M16 12h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-3a2 2 0 0 1 0-4z"/>
        </svg>
      );
    default:
      return null;
  }
}

export default function AppLauncher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const roles: string[] =
    (keycloak.tokenParsed as { realm_access?: { roles?: string[] } })
      ?.realm_access?.roles ?? [];

  const urls = getUrls();

  const visibles = APPS.filter(
    (a) => !a.roles || a.roles.some((r) => roles.includes(r)),
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="app-launcher" ref={ref}>
      <button
        className={`launcher-btn${open ? ' launcher-btn--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Aplicaciones"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3"  y="3"  width="4" height="4" rx="1"/>
          <rect x="10" y="3"  width="4" height="4" rx="1"/>
          <rect x="17" y="3"  width="4" height="4" rx="1"/>
          <rect x="3"  y="10" width="4" height="4" rx="1"/>
          <rect x="10" y="10" width="4" height="4" rx="1"/>
          <rect x="17" y="10" width="4" height="4" rx="1"/>
          <rect x="3"  y="17" width="4" height="4" rx="1"/>
          <rect x="10" y="17" width="4" height="4" rx="1"/>
          <rect x="17" y="17" width="4" height="4" rx="1"/>
        </svg>
      </button>

      {open && (
        <div className="launcher-panel">
          <div className="launcher-grid">
            {visibles.map((app) => (
              <a
                key={app.id}
                href={urls[app.id]}
                className="launcher-app"
                onClick={() => setOpen(false)}
              >
                <span className="launcher-icono" style={{ background: app.color }}>
                  <AppIcon id={app.id} />
                </span>
                <span className="launcher-nombre">{app.nombre}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
