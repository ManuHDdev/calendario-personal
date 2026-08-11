import { useState, useEffect } from 'react';
import type { UserOut, UserFormData } from '../types';
import PasswordInput from './PasswordInput';
import './UserModal.css';

const ALL_ROLES = ['admin', 'familia', 'invitado', 'paraisos_admin', 'mapacyd_admin', 'reparto_admin', 'reparto_invitado'];

interface Props {
  user: UserOut | null; // null = crear
  onSave: (data: UserFormData) => Promise<void>;
  onCancel: () => void;
}

export default function UserModal({ user, onSave, onCancel }: Props) {
  const isEdit = user !== null;

  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<string[]>(user?.roles ?? []);
  const [enabled, setEnabled] = useState(user?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setUsername(user?.username ?? '');
    setEmail(user?.email ?? '');
    setPassword('');
    setRoles(user?.roles ?? []);
    setEnabled(user?.enabled ?? true);
    setError('');
  }, [user]);

  const toggleRole = (role: string) => {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEdit && !password) { setError('La contraseña es obligatoria'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({ username, email, password, roles, enabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const roleLabels: Record<string, string> = {
    admin: 'Administrador',
    familia: 'Familia',
    invitado: 'Invitado',
    paraisos_admin: 'Admin Paraísos',
    mapacyd_admin: 'Admin MapaCYD',
    reparto_admin: 'Admin Reparto',
    reparto_invitado: 'Invitado Reparto',
  };
  const roleColors: Record<string, string> = {
    admin: '#0071e3',
    familia: '#34c759',
    invitado: '#aeaeb2',
    paraisos_admin: '#00c7be',
    mapacyd_admin: '#30d158',
    reparto_admin: '#a2845e',
    reparto_invitado: '#a2845e',
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h2>
          <button className="modal-close" onClick={onCancel} aria-label="Cerrar">×</button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit} autoComplete="off">
          <div className="field-group">
            <label className="field-label">Usuario</label>
            <input
              className="field-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="nombre_usuario"
              required
              disabled={isEdit}
              autoFocus={!isEdit}
              autoComplete="off"
            />
          </div>

          <div className="field-group">
            <label className="field-label">Email <span className="field-optional">(opcional)</span></label>
            <input
              className="field-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              autoComplete="off"
            />
          </div>

          <div className="field-group">
            <label className="field-label">
              Contraseña {isEdit && <span className="field-optional">(dejar vacío para no cambiar)</span>}
            </label>
            <PasswordInput
              value={password}
              onChange={setPassword}
              placeholder={isEdit ? '••••••••' : 'Contraseña'}
              required={!isEdit}
              autoFocus={isEdit}
            />
          </div>

          <div className="field-group">
            <label className="field-label">Roles</label>
            <div className="role-checkboxes">
              {ALL_ROLES.map((role) => (
                <label key={role} className={`role-chip ${roles.includes(role) ? 'role-chip--active' : ''}`}
                  style={{ '--role-color': roleColors[role] } as React.CSSProperties}>
                  <input
                    type="checkbox"
                    checked={roles.includes(role)}
                    onChange={() => toggleRole(role)}
                    style={{ display: 'none' }}
                  />
                  {roles.includes(role) && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                  {roleLabels[role]}
                </label>
              ))}
            </div>
          </div>

          <div className="field-group field-group--inline">
            <label className="field-label">Cuenta activa</label>
            <button
              type="button"
              className={`toggle-btn ${enabled ? 'toggle-btn--on' : ''}`}
              onClick={() => setEnabled((v) => !v)}
            >
              <span className="toggle-thumb" />
            </button>
          </div>

          {error && <p className="modal-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="btn-save" disabled={saving}>
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
