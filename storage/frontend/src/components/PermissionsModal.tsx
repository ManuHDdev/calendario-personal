import { useEffect, useState } from 'react';
import type { AppUser, PermissionsResourceType } from '../types';
import { getPermissions, listUsers, setPermissions } from '../services/api';
import './PermissionsModal.css';

interface Props {
  resourceType: PermissionsResourceType;
  resourcePath: string;
  resourceName: string;
  currentUserId: string;
  onClose: () => void;
}

export default function PermissionsModal({
  resourceType,
  resourcePath,
  resourceName,
  currentUserId,
  onClose,
}: Props) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listUsers(), getPermissions(resourceType, resourcePath)])
      .then(([allUsers, granted]) => {
        if (cancelled) return;
        setUsers(allUsers.filter((u) => u.id !== currentUserId));
        setSelected(new Set(granted));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar los permisos');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resourceType, resourcePath, currentUserId]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await setPermissions(resourceType, resourcePath, Array.from(selected));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los permisos');
      setSaving(false);
    }
  };

  return (
    <div className="perm-overlay" onClick={onClose}>
      <div className="perm-box" onClick={(e) => e.stopPropagation()}>
        <div className="perm-header">
          <span className="perm-title">Compartir {resourceType === 'file' ? 'archivo' : 'carpeta'}</span>
          <button className="perm-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className="perm-name">"{resourceName}"</p>

        {error && <p className="perm-error">{error}</p>}

        {loading ? (
          <div className="perm-loading"><div className="perm-spinner" /></div>
        ) : (
          <div className="perm-list">
            {users.length === 0 && <p className="perm-empty">No hay más usuarios en la aplicación</p>}
            {users.map((user) => (
              <label key={user.id} className="perm-option">
                <input
                  type="checkbox"
                  checked={selected.has(user.id)}
                  onChange={() => toggle(user.id)}
                />
                <span>{user.username}</span>
              </label>
            ))}
          </div>
        )}

        <div className="perm-actions">
          <button className="perm-btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="perm-btn-confirm" onClick={handleSave} disabled={loading || saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
