import type { ReactNode } from 'react';
import keycloak, { canRead } from '../services/keycloak';

/** Access gate: needs admin, familia, viajes_admin or viajes_invitado. */
export default function RequireAccess({ children }: { children: ReactNode }) {
  if (!canRead()) {
    return (
      <div className="fullscreen-status">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="fullscreen-status-title">Acceso denegado</p>
        <p className="fullscreen-status-hint">Necesitas el rol admin, familia, viajes_admin o viajes_invitado.</p>
        <button className="btn-secondary" onClick={() => keycloak.logout()}>Cerrar sesión</button>
      </div>
    );
  }
  return <>{children}</>;
}
