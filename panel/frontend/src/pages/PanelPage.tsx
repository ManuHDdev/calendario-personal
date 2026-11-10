import { useState, useEffect, useCallback } from 'react';
import keycloak from '../services/keycloak';
import { getUsers, getPresence, createUser, updateUser, deleteUser } from '../services/api';
import { presenceLabel, presenceTitle } from '../lib/presence';
import UserModal from '../components/UserModal';
import ConfirmDialog from '../components/ConfirmDialog';
import AppLauncher from '../components/AppLauncher';
import ThemeToggle from '../components/ThemeToggle';
import UsageDashboard from '../components/UsageDashboard';
import type { UserOut, UserFormData, Presence } from '../types';
import './PanelPage.css';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  familia: 'Familia',
  invitado: 'Invitado',
  paraisos_admin: 'Admin Paraísos',
  mapacyd_admin: 'Admin MapaCYD',
  mapacyd_invitado: 'Invitado MapaCYD',
  reparto_admin: 'Admin Reparto',
  reparto_invitado: 'Invitado Reparto',
  mensajeria_admin: 'Admin Mensajería',
  mensajeria_invitado: 'Invitado Mensajería',
  tenis_admin: 'Admin Tenis',
  tenis_invitado: 'Invitado Tenis',
  descargas_admin: 'Admin Descargas',
  descargas_invitado: 'Invitado Descargas',
  viajes_admin: 'Admin Viajes',
  viajes_invitado: 'Invitado Viajes',
};
const ROLE_COLOR: Record<string, string> = {
  admin: '#0071e3',
  familia: '#34c759',
  invitado: '#aeaeb2',
  paraisos_admin: '#00c7be',
  mapacyd_admin: '#30d158',
  mapacyd_invitado: '#8fd9a8',
  reparto_admin: '#a2845e',
  reparto_invitado: '#c7ab8c',
  mensajeria_admin: '#0a84c7',
  mensajeria_invitado: '#8ecdea',
  tenis_admin: '#8bc900',
  tenis_invitado: '#d4f21e',
  descargas_admin: '#78909c',
  descargas_invitado: '#b0bec5',
  viajes_admin: '#ec4899',
  viajes_invitado: '#f4a6cb',
};

// Con más badges de estos el resto se resume en un chip "+N" para que todas las filas midan lo mismo.
const MAX_VISIBLE_ROLES = 2;

const PRESENCE_POLL_MS = 30_000;

export default function PanelPage() {
  const [users, setUsers] = useState<UserOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalUser, setModalUser] = useState<UserOut | null | undefined>(undefined); // undefined=cerrado, null=crear, UserOut=editar
  const [deleteTarget, setDeleteTarget] = useState<UserOut | null>(null);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [presence, setPresence] = useState<Record<string, Presence>>({});
  const [now, setNow] = useState(() => Date.now());

  const toggleRoles = (id: string) =>
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const username = (keycloak.tokenParsed as { preferred_username?: string })?.preferred_username ?? 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setUsers(await getUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Un fallo puntual al sondear no debe mostrar errores ni borrar lo último que se vio.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await getPresence();
        if (!cancelled) {
          setPresence(data);
          setNow(Date.now());
        }
      } catch { /* se reintenta en el siguiente ciclo */ }
    };
    poll();
    const id = setInterval(poll, PRESENCE_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const onlineCount = users.filter((u) => presence[u.id]?.status === 'online').length;

  const handleSave = async (data: UserFormData) => {
    if (modalUser === null) {
      await createUser(data);
    } else if (modalUser) {
      await updateUser(modalUser.id, data);
    }
    setModalUser(undefined);
    await load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
      setDeleteTarget(null);
    }
  };

  return (
    <div className="panel-layout">
      <header className="panel-header">
        <div className="panel-header-left">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <h1 className="panel-title">Panel de Administración</h1>
        </div>
        <div className="panel-header-right">
          <ThemeToggle />
          <AppLauncher />
          <span className="panel-username">{username}</span>
          <a href="/storage/" className="panel-link-btn" title="Ir a Storage">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
            Storage
          </a>
          <button className="panel-logout-btn" onClick={() => keycloak.logout()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Salir
          </button>
        </div>
      </header>

      <main className="panel-main">
        <div className="panel-section-header">
          <div className="panel-section-heading">
            <h2 className="panel-section-title">Usuarios</h2>
            {onlineCount > 0 && (
              <span className="panel-online-count" title="Usuarios con actividad en los últimos 5 minutos">
                <span className="presence-dot presence-dot--online presence-dot--inline" aria-hidden="true" />
                {onlineCount} en línea
              </span>
            )}
          </div>
          <button className="btn-new-user" onClick={() => setModalUser(null)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nuevo usuario
          </button>
        </div>

        {error && <div className="panel-error">{error}</div>}

        {loading ? (
          <div className="panel-loading">
            <div className="panel-spinner" />
          </div>
        ) : (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Email</th>
                  <th>Roles</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="table-empty">No hay usuarios</td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const roles = u.roles.filter((r) => r in ROLE_LABEL);
                    const expanded = expandedRoles.has(u.id);
                    const visibleRoles = expanded ? roles : roles.slice(0, MAX_VISIBLE_ROLES);
                    const hiddenRoles = roles.slice(MAX_VISIBLE_ROLES);
                    return (
                    <tr key={u.id}>
                      <td>
                        <div className="user-name-cell">
                          <div className="user-avatar-wrap">
                            <div className="user-avatar">{u.username.charAt(0).toUpperCase()}</div>
                            {presence[u.id] && (
                              <span className={`presence-dot presence-dot--${presence[u.id].status}`} aria-hidden="true" />
                            )}
                          </div>
                          <div className="user-name-block">
                            <span className="user-name" title={u.username}>{u.username}</span>
                            {presence[u.id] && (
                              <span
                                className={`user-presence user-presence--${presence[u.id].status}`}
                                title={presenceTitle(presence[u.id])}
                              >
                                {presenceLabel(presence[u.id], now)}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="user-email" title={u.email || undefined}>{u.email || <span className="no-data">—</span>}</td>
                      <td>
                        <div className="role-badges">
                          {visibleRoles.map((r) => (
                            <span key={r} className="role-badge"
                              style={{ '--role-color': ROLE_COLOR[r] ?? '#aeaeb2' } as React.CSSProperties}>
                              {ROLE_LABEL[r]}
                            </span>
                          ))}
                          {hiddenRoles.length > 0 && (
                            <button
                              type="button"
                              className="role-more"
                              aria-expanded={expanded}
                              title={expanded ? 'Mostrar menos' : hiddenRoles.map((r) => ROLE_LABEL[r]).join(', ')}
                              onClick={() => toggleRoles(u.id)}
                            >
                              {expanded ? 'Menos' : `+${hiddenRoles.length}`}
                            </button>
                          )}
                          {roles.length === 0 && <span className="no-data">Sin rol</span>}
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${u.enabled ? 'status-badge--on' : 'status-badge--off'}`}>
                          {u.enabled ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="user-actions-cell">
                        <button className="tbl-btn tbl-btn--edit" title="Editar" onClick={() => setModalUser(u)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button className="tbl-btn tbl-btn--delete" title="Eliminar" onClick={() => setDeleteTarget(u)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14H6L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        <UsageDashboard />
      </main>

      {modalUser !== undefined && (
        <UserModal
          user={modalUser}
          onSave={handleSave}
          onCancel={() => setModalUser(undefined)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`¿Eliminar el usuario "${deleteTarget.username}"? Esta acción no se puede deshacer.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
