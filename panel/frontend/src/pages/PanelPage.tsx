import { useState, useEffect, useCallback } from 'react';
import keycloak from '../services/keycloak';
import { getUsers, createUser, updateUser, deleteUser } from '../services/api';
import UserModal from '../components/UserModal';
import ConfirmDialog from '../components/ConfirmDialog';
import AppLauncher from '../components/AppLauncher';
import type { UserOut, UserFormData } from '../types';
import './PanelPage.css';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  familia: 'Familia',
  invitado: 'Invitado',
  paraisos_admin: 'Admin Paraísos',
  mapacyd_admin: 'Admin MapaCYD',
};
const ROLE_COLOR: Record<string, string> = {
  admin: '#0071e3',
  familia: '#34c759',
  invitado: '#aeaeb2',
  paraisos_admin: '#00c7be',
  mapacyd_admin: '#30d158',
};

export default function PanelPage() {
  const [users, setUsers] = useState<UserOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalUser, setModalUser] = useState<UserOut | null | undefined>(undefined); // undefined=cerrado, null=crear, UserOut=editar
  const [deleteTarget, setDeleteTarget] = useState<UserOut | null>(null);

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
          <h2 className="panel-section-title">Usuarios</h2>
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
                  users.map((u) => (
                    <tr key={u.id}>
                      <td className="user-name-cell">
                        <div className="user-avatar">{u.username.charAt(0).toUpperCase()}</div>
                        <span className="user-name">{u.username}</span>
                      </td>
                      <td className="user-email">{u.email || <span className="no-data">—</span>}</td>
                      <td>
                        <div className="role-badges">
                          {u.roles.filter((r) => ['admin','familia','invitado','paraisos_admin','mapacyd_admin'].includes(r)).map((r) => (
                            <span key={r} className="role-badge"
                              style={{ '--role-color': ROLE_COLOR[r] ?? '#aeaeb2' } as React.CSSProperties}>
                              {ROLE_LABEL[r] ?? r}
                            </span>
                          ))}
                          {u.roles.filter((r) => ['admin','familia','invitado','paraisos_admin','mapacyd_admin'].includes(r)).length === 0 && (
                            <span className="no-data">Sin rol</span>
                          )}
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
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
