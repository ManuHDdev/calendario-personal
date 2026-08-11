import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { resolveGroupByToken, ApiError } from '../services/api';
import { loadGroupSession, storeGroupSession } from '../services/groupSession';
import GroupPage from './GroupPage';

/**
 * Flujo de miembro sin cuenta (`/reparto/g/:token`, tasks.md 7.3). `:token`
 * en la URL es el `access_token` opaco del grupo — se resuelve una vez contra
 * `POST /groups/by-token` y el `sessionToken` devuelto se cachea en
 * sessionStorage para no repetir el intercambio en cada recarga dentro de la
 * misma pestaña.
 */
export default function TokenGroupPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'invalid' }
    | { status: 'error'; message: string }
    | { status: 'ready'; groupId: string; sessionToken: string }
  >({ status: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ status: 'invalid' });
      return;
    }

    const cached = loadGroupSession(token);
    if (cached) {
      setState({ status: 'ready', groupId: cached.groupId, sessionToken: cached.sessionToken });
      return;
    }

    resolveGroupByToken(token)
      .then((res) => {
        if (!res) {
          setState({ status: 'invalid' });
          return;
        }
        storeGroupSession(token, res);
        setState({ status: 'ready', groupId: res.groupId, sessionToken: res.sessionToken });
      })
      .catch((err) => {
        setState({ status: 'error', message: err instanceof ApiError ? err.message : 'Error al resolver el enlace' });
      });
  }, [token]);

  if (state.status === 'loading') {
    return (
      <div className="fullscreen-status">
        <div className="spinner" />
        <p>Comprobando el enlace…</p>
      </div>
    );
  }

  if (state.status === 'invalid') {
    return (
      <div className="fullscreen-status">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="fullscreen-status-title">Este enlace ya no es válido</p>
        <p className="fullscreen-status-hint">
          Puede que el grupo haya sido borrado o que el gestor haya regenerado el enlace de acceso.
          Pide uno nuevo a quien te lo compartió.
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="fullscreen-status">
        <p className="fullscreen-status-title">No se ha podido cargar el grupo</p>
        <p className="fullscreen-status-hint">{state.message}</p>
      </div>
    );
  }

  return (
    <GroupPage
      groupId={state.groupId}
      auth={{ token: state.sessionToken, isManager: false, isReadOnly: false }}
    />
  );
}
