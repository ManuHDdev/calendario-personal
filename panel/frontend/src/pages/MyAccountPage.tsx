import { useState } from 'react';
import type { FormEvent } from 'react';
import keycloak from '../services/keycloak';
import { changeMyPassword } from '../services/api';
import PasswordInput from '../components/PasswordInput';
import '../components/UserModal.css';
import './PanelPage.css';
import './MyAccountPage.css';

export default function MyAccountPage() {
  const username = (keycloak.tokenParsed as { preferred_username?: string })?.preferred_username ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setSaving(true);
    try {
      await changeMyPassword(password);
      setPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar la contraseña');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel-layout">
      <header className="panel-header">
        <div className="panel-header-left">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <h1 className="panel-title">Mi cuenta</h1>
        </div>
        <div className="panel-header-right">
          <span className="panel-username">{username}</span>
          <button className="panel-logout-btn" onClick={() => keycloak.logout()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Salir
          </button>
        </div>
      </header>

      <main className="my-account-main">
        <div className="my-account-card">
          <h2 className="my-account-title">Cambiar contraseña</h2>
          <p className="my-account-subtitle">Actualiza la contraseña de tu cuenta. Es lo único que puedes hacer desde aquí.</p>

          <form className="my-account-form" onSubmit={handleSubmit} autoComplete="off">
            <div className="field-group">
              <label className="field-label">Nueva contraseña</label>
              <PasswordInput
                value={password}
                onChange={setPassword}
                placeholder="Nueva contraseña"
                required
                autoFocus
              />
            </div>

            <div className="field-group">
              <label className="field-label">Confirmar contraseña</label>
              <PasswordInput
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Repite la contraseña"
                required
              />
            </div>

            {error && <p className="modal-error">{error}</p>}
            {success && <p className="my-account-success">Contraseña actualizada correctamente.</p>}

            <div className="my-account-actions">
              <button type="submit" className="btn-save" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
