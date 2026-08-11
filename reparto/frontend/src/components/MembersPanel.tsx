import { useState, type FormEvent } from 'react';
import type { Member } from '../types';

interface Props {
  members: Member[];
  canWrite: boolean;
  canRemove: boolean;
  onAdd: (name: string) => Promise<void>;
  onRename: (memberId: string, name: string) => Promise<void>;
  onRemove: (memberId: string) => Promise<void>;
}

export default function MembersPanel({ members, canWrite, canRemove, onAdd, onRename, onRemove }: Props) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await onAdd(name.trim());
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al añadir el miembro');
    } finally {
      setSaving(false);
    }
  };

  const startRename = (m: Member) => {
    setEditingId(m.id);
    setEditingName(m.name);
  };

  const confirmRename = async (memberId: string) => {
    if (!editingName.trim()) return;
    try {
      await onRename(memberId, editingName.trim());
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al renombrar el miembro');
    }
  };

  return (
    <div className="members-panel">
      {canWrite && (
        <form className="member-add-form" onSubmit={handleAdd}>
          <input
            type="text" placeholder="Nombre del nuevo miembro"
            value={name} onChange={(e) => setName(e.target.value)} required
          />
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Añadiendo…' : 'Añadir miembro'}
          </button>
        </form>
      )}
      {error && <div className="expense-form-error">{error}</div>}

      <ul className="member-list">
        {members.map((m) => (
          <li key={m.id} className="member-row">
            {editingId === m.id ? (
              <>
                <input
                  type="text" value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="member-rename-input"
                />
                <button className="btn-secondary" onClick={() => confirmRename(m.id)}>Guardar</button>
                <button className="btn-secondary" onClick={() => setEditingId(null)}>Cancelar</button>
              </>
            ) : (
              <>
                <span className="member-name">{m.name}</span>
                {canWrite && (
                  <button className="btn-secondary" onClick={() => startRename(m)}>Renombrar</button>
                )}
                {canRemove && (
                  <button className="btn-danger" onClick={() => onRemove(m.id)}>Eliminar</button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
