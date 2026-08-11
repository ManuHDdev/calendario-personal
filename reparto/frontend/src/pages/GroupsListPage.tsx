import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import keycloak, { isManager } from '../services/keycloak';
import AppLauncher from '../components/AppLauncher';
import ThemeToggle from '../components/ThemeToggle';
import { listGroups, createGroup, ApiError } from '../services/api';
import type { GroupSummary } from '../types';
import './GroupsListPage.css';

export default function GroupsListPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const manager = isManager();
  const username = (keycloak.tokenParsed as { preferred_username?: string })?.preferred_username ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listGroups(keycloak.token!);
      setGroups(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al cargar los grupos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError('');
    try {
      const group = await createGroup(keycloak.token!, name.trim());
      setName('');
      navigate(`/groups/${group.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al crear el grupo');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="reparto-layout">
      <header className="reparto-header">
        <div className="reparto-header-left">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a9e46" strokeWidth="1.8">
            <circle cx="9" cy="7" r="3" /><path d="M2 20c0-3.3 3-6 7-6s7 2.7 7 6" />
            <circle cx="17" cy="7" r="3" /><path d="M14.5 14.2c3.4.4 5.5 2.8 5.5 5.8" />
          </svg>
          <h1 className="reparto-title">Reparto</h1>
        </div>
        <div className="reparto-header-right">
          <ThemeToggle />
          <AppLauncher />
          {username && <span className="reparto-username">{username}</span>}
          <button className="reparto-logout-btn" onClick={() => keycloak.logout()}>Salir</button>
        </div>
      </header>

      <main className="reparto-main">
        {error && <div className="reparto-error">{error}</div>}

        {manager && (
          <section className="reparto-section">
            <h2 className="reparto-section-title">Crear grupo</h2>
            <form className="group-create-form" onSubmit={handleCreate}>
              <input
                type="text"
                placeholder="Nombre del grupo (p. ej. Viaje a Lisboa)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <button type="submit" className="btn-primary" disabled={creating}>
                {creating ? 'Creando…' : 'Crear grupo'}
              </button>
            </form>
          </section>
        )}

        <section className="reparto-section">
          <h2 className="reparto-section-title">Tus grupos</h2>
          {loading ? (
            <p className="empty-hint">Cargando…</p>
          ) : groups.length === 0 ? (
            <p className="empty-hint">Todavía no hay ningún grupo.</p>
          ) : (
            <ul className="group-list">
              {groups.map((g) => (
                <li key={g.id}>
                  <button className="group-list-item" onClick={() => navigate(`/groups/${g.id}`)}>
                    <span className="group-list-name">{g.name}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
