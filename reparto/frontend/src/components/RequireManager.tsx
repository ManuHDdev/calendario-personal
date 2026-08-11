import { useEffect, useState, type ReactNode } from 'react';
import keycloak from '../services/keycloak';
import { hasAnyRepartoRole } from '../services/keycloak';

interface Props {
  children: ReactNode;
}

/**
 * Guard de las rutas de gestor (listado de grupos, vista de grupo vía
 * Keycloak). A diferencia de gastos (login-required desde `main.tsx`), aquí
 * el login solo se exige dentro de esta rama de rutas — `/g/:token` nunca
 * pasa por este componente (tasks.md 7.2/7.3).
 */
export default function RequireManager({ children }: Props) {
  const [ready, setReady] = useState(keycloak.authenticated === true);

  useEffect(() => {
    if (keycloak.authenticated) {
      setReady(true);
      return;
    }
    keycloak.login();
  }, []);

  if (!keycloak.authenticated) {
    return (
      <div className="fullscreen-status">
        <div className="spinner" />
        <p>Redirigiendo al inicio de sesión…</p>
      </div>
    );
  }

  if (!ready) return null;

  if (!hasAnyRepartoRole()) {
    return (
      <div className="fullscreen-status">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="fullscreen-status-title">Acceso denegado</p>
        <p className="fullscreen-status-hint">Necesitas el rol admin, reparto_admin o reparto_invitado.</p>
        <button className="btn-secondary" onClick={() => keycloak.logout()}>Cerrar sesión</button>
      </div>
    );
  }

  return <>{children}</>;
}
