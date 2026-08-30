import { useState, useEffect, useRef } from 'react';
import keycloak from '../auth/keycloak';
import './AppLauncher.css';

interface AppDef {
  id: string;
  nombre: string;
  color: string;
  roles: string[] | null; // null = visible para todos
}

const APPS: AppDef[] = [
  { id: 'calendario', nombre: 'Calendario', color: '#0071e3', roles: ['admin'] },
  { id: 'storage',    nombre: 'Storage',    color: '#5e5ce6', roles: ['admin', 'familia'] },
  { id: 'mapacyd',    nombre: 'MapaCYD',    color: '#30d158', roles: ['admin', 'familia', 'mapacyd_admin', 'mapacyd_invitado'] },
  { id: 'panel',      nombre: 'Panel',      color: '#ff9f0a', roles: null },
  { id: 'ytdl',       nombre: 'Ytdl',       color: '#ff375f', roles: null },
  { id: 'gastos',     nombre: 'Gastos',     color: '#ffd60a', roles: ['admin'] },
  { id: 'ofertas',    nombre: 'Ofertas',    color: '#bf5af2', roles: ['admin'] },
  { id: 'paraisos',   nombre: 'Paraísos',   color: '#00c7be', roles: null },
  // juegos: primera subapp abierta a CUALQUIER rol autenticado (admin,
  // familia, invitado) — no confundir con `roles: null` de ytdl/paraisos,
  // que son públicas sin sesión. Aquí sí se exige login, pero ningún rol
  // concreto (ver design.md "Access guard: any valid role").
  { id: 'juegos',     nombre: 'Juegos',     color: '#ff453a', roles: ['admin', 'familia', 'invitado'] },
  { id: 'watchlist',  nombre: 'Watchlist',  color: '#64d2ff', roles: ['admin'] },
  { id: 'reparto',    nombre: 'Reparto',    color: '#a2845e', roles: ['admin', 'reparto_admin', 'reparto_invitado'] },
  { id: 'ruta',       nombre: 'Ruta',       color: '#e07a5f', roles: ['admin'] },
  { id: 'pisos',      nombre: 'Pisos',      color: '#7cb518', roles: ['admin'] },
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
    ofertas:    local ? 'http://localhost:5178/ofertas/' : '/ofertas/',
    paraisos:   local ? 'http://localhost:5179/paraisos/' : '/paraisos/',
    juegos:     local ? 'http://localhost:5180/juegos/'  : '/juegos/',
    watchlist:  local ? 'http://localhost:5181/watchlist/' : '/watchlist/',
    reparto:    local ? 'http://localhost:5182/reparto/'   : '/reparto/',
    ruta:       local ? 'http://localhost:5183/ruta/'     : '/ruta/',
    pisos:      local ? 'http://localhost:5184/pisos/'   : '/pisos/',
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
    case 'ofertas':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
          <path d="M20.59 13.41 12 22l-9-9V3h10l7.59 7.59a2 2 0 0 1 0 2.82z"/>
          <circle cx="7.5" cy="7.5" r="1.5" fill="white" stroke="none"/>
        </svg>
      );
    case 'paraisos':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
          <path d="M2 22l1-1h18l1 1"/>
          <path d="M12 13V2"/>
          <path d="M12 2c-3 4-7 5.5-7 8.5S8 16 12 13"/>
          <path d="M12 2c3 4 7 5.5 7 8.5S16 16 12 13"/>
        </svg>
      );
    case 'juegos':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
          <rect x="2" y="7" width="20" height="10" rx="5"/>
          <line x1="7" y1="12" x2="7" y2="12.01"/>
          <line x1="6" y1="10.5" x2="6" y2="13.5"/>
          <line x1="4.5" y1="12" x2="7.5" y2="12"/>
          <circle cx="16" cy="10.5" r="1" fill="white" stroke="none"/>
          <circle cx="18" cy="13" r="1" fill="white" stroke="none"/>
        </svg>
      );
    case 'watchlist':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
          <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>
        </svg>
      );
    case 'reparto':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9"/>
          <line x1="12" y1="12" x2="12" y2="3"/>
          <line x1="12" y1="12" x2="19.36" y2="16.5"/>
          <line x1="12" y1="12" x2="4.64" y2="16.5"/>
        </svg>
      );
    case 'ruta':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
          <circle cx="6" cy="19" r="2.4"/>
          <circle cx="18" cy="5" r="2.4"/>
          <path d="M8.4 19h5.1a3.5 3.5 0 0 0 0-7h-3a3.5 3.5 0 0 1 0-7h5.1"/>
        </svg>
      );
    case 'pisos':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
          <path d="M3 10.5 12 3l9 7.5"/>
          <path d="M5 9.8V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.8"/>
          <rect x="9.5" y="13" width="5" height="8"/>
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
    <div className="mapa-app-launcher" ref={ref}>
      <button
        className={`mapa-launcher-btn${open ? ' mapa-launcher-btn--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Aplicaciones"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
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
        <div className="mapa-launcher-panel">
          <div className="mapa-launcher-grid">
            {visibles.map((app) => (
              <a
                key={app.id}
                href={urls[app.id]}
                className="mapa-launcher-app"
                onClick={() => setOpen(false)}
              >
                <span className="mapa-launcher-icono" style={{ background: app.color }}>
                  <AppIcon id={app.id} />
                </span>
                <span className="mapa-launcher-nombre">{app.nombre}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
