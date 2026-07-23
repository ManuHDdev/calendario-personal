import { useState } from 'react';
import { usePreferenciaCiudad } from '../hooks/usePreferenciaCiudad';

export function PreferenciaCiudad() {
  const { preferencia, loading, saving, error, guardarCiudad } = usePreferenciaCiudad();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  const startEdit = () => {
    setValue(preferencia?.ciudad ?? '');
    setEditing(true);
  };

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    try {
      await guardarCiudad(trimmed);
      setEditing(false);
    } catch {
      // el error ya queda reflejado en `error` del hook, se muestra abajo
    }
  };

  if (loading) return null;

  return (
    <div className="mapa-preferencia">
      {editing ? (
        <div className="mapa-preferencia-form">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setEditing(false);
            }}
            placeholder="Nombre de la ciudad"
          />
          <button onClick={handleSave} disabled={saving} title="Guardar">
            {saving ? '…' : '✓'}
          </button>
          <button onClick={() => setEditing(false)} disabled={saving} title="Cancelar">✕</button>
        </div>
      ) : (
        <button className="mapa-preferencia-btn" onClick={startEdit} title="Cambiar tu ciudad preferida">
          📍 {preferencia?.ciudad ?? 'Cáceres'}
        </button>
      )}
      {error && <div className="mapa-preferencia-error">{error}</div>}
    </div>
  );
}
