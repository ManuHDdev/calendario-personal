import { useEffect, useState } from 'react';
import type { AppUser, PermissionsResourceType } from '../types';
import { getPermissions, listUsers, setPermissions } from '../services/api';
import './PermissionsModal.css';

export interface ShareResource {
  type: PermissionsResourceType;
  path: string;
  name: string;
}

interface Props {
  resources: ShareResource[];
  currentUserId: string;
  onClose: () => void;
}

export default function PermissionsModal({ resources, currentUserId, onClose }: Props) {
  const single = resources.length === 1 ? resources[0] : null;

  const [users, setUsers] = useState<AppUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const allUsers = await listUsers();
        if (cancelled) return;
        setUsers(allUsers.filter((u) => u.id !== currentUserId));
        // En modo individual precargamos los permisos actuales (edición "set
        // exacto"); en lote no, porque cada recurso puede tener un estado
        // distinto — se parte de vacío y el guardado es aditivo.
        if (single) {
          const granted = await getPermissions(single.type, single.path);
          if (!cancelled) setSelected(new Set(granted));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar los permisos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [single?.type, single?.path, currentUserId]);

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
    if (single) {
      try {
        await setPermissions(single.type, single.path, Array.from(selected));
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudieron guardar los permisos');
        setSaving(false);
      }
      return;
    }

    // Aditivo: cada recurso conserva sus permisos ya concedidos y se le
    // añaden los usuarios marcados aquí, sin pisar accesos individuales.
    // allSettled para que un recurso sin permiso (p.ej. no eres el dueño) no
    // impida guardar el resto del lote.
    const results = await Promise.allSettled(
      resources.map(async (r) => {
        const current = await getPermissions(r.type, r.path);
        const union = new Set([...current, ...selected]);
        await setPermissions(r.type, r.path, Array.from(union));
      }),
    );
    const failedCount = results.filter((r) => r.status === 'rejected').length;
    if (failedCount > 0) {
      setError(`No se pudieron actualizar los permisos de ${failedCount} de ${resources.length} elemento(s).`);
      setSaving(false);
      return;
    }
    onClose();
  };

  const title = single
    ? `Compartir ${single.type === 'file' ? 'archivo' : 'carpeta'}`
    : `Compartir ${resources.length} elementos`;

  return (
    <div className="perm-overlay" onClick={onClose}>
      <div className="perm-box" onClick={(e) => e.stopPropagation()}>
        <div className="perm-header">
          <span className="perm-title">{title}</span>
          <button className="perm-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className="perm-name">
          {single ? `"${single.name}"` : resources.map((r) => r.name).join(', ')}
        </p>

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
