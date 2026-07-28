import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import type { TipoZona, ZonaCyd } from '../types/zona';

interface ZonaModalProps {
  modo:             'crear' | 'editar';
  zona?:            ZonaCyd;
  /** Tipo de marca a crear (elegido antes de abrir el modal, no editable aquí) */
  tipo?:            TipoZona;
  latitudInicial?:  number;
  longitudInicial?: number;
  onClose:          () => void;
  /** Recibe la zona guardada (creada o editada) devuelta por la API */
  onSuccess:        (zonaGuardada: ZonaCyd) => void;
}

// ─── Helpers de estilos ──────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '8px 10px', fontSize: 13,
  border: '1px solid #d1d1d6', borderRadius: 7,
  outline: 'none', fontFamily: 'system-ui, sans-serif',
  color: '#1c1c1e', background: '#fff',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500,
  color: '#636366', marginBottom: 4,
  textTransform: 'uppercase', letterSpacing: '0.04em',
};

const fieldStyle: React.CSSProperties = { marginBottom: 14 };

// ─── Componente ──────────────────────────────────────────────────────────────

export function ZonaModal({
  modo, zona, tipo, latitudInicial, longitudInicial, onClose, onSuccess,
}: ZonaModalProps) {
  const { token } = useAuth();
  const tipoActual: TipoZona = zona?.tipo ?? tipo ?? 'carga_descarga';

  const [nombre,      setNombre]      = useState(zona?.nombre       ?? '');
  const [descripcion, setDescripcion] = useState(zona?.descripcion  ?? '');
  const [ciudad,      setCiudad]      = useState(zona?.ciudad       ?? 'Cáceres');
  const [latitud,     setLatitud]     = useState<number>(
    zona?.latitud ?? latitudInicial ?? 39.4753,
  );
  const [longitud, setLongitud]       = useState<number>(
    zona?.longitud ?? longitudInicial ?? -6.3724,
  );
  const [loading, setLoading]         = useState(false);
  const [error,   setError]           = useState<string | null>(null);

  const isValid =
    nombre.trim().length > 0 &&
    ciudad.trim().length > 0 &&
    latitud >= -90  && latitud <= 90 &&
    longitud >= -180 && longitud <= 180;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !isValid || loading) return;
    setLoading(true);
    setError(null);
    const API = import.meta.env.BASE_URL + 'api';
    try {
      const body = {
        nombre:      nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        ciudad:      ciudad.trim(),
        latitud,
        longitud,
        tipo:        tipoActual,
      };
      const url    = modo === 'editar' ? `${API}/zonas/${zona!.id}` : `${API}/zonas`;
      const method = modo === 'editar' ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let msg = `Error ${res.status}`;
        try { const b = (await res.json()) as { error?: string }; if (b.error) msg = b.error; }
        catch { /* ignore */ }
        throw new Error(msg);
      }
      const saved = (await res.json()) as ZonaCyd;
      onSuccess(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la zona');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.5)',
      zIndex: 1100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 24,
        maxWidth: 480, width: '90%',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        fontFamily: 'system-ui, sans-serif',
      }}>
        {/* Título */}
        <div style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e', marginBottom: 20 }}>
          {modo === 'editar'
            ? `Editar: ${zona?.nombre}`
            : tipoActual === 'aparcamiento' ? 'Nuevo spot de aparcamiento' : 'Nueva zona de carga/descarga'}
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Nombre */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Nombre *</label>
            <input
              style={inputStyle}
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              maxLength={100}
              required
              autoFocus
              placeholder="Zona de carga calle Mayor"
            />
          </div>

          {/* Descripción */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Descripción</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              maxLength={255}
              placeholder="Opcional"
            />
          </div>

          {/* Ciudad */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Ciudad *</label>
            <input
              style={inputStyle}
              type="text"
              value={ciudad}
              onChange={e => setCiudad(e.target.value)}
              required
              placeholder="Cáceres"
            />
          </div>

          {/* Latitud / Longitud en fila */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Latitud *</label>
              <input
                style={inputStyle}
                type="number"
                value={latitud}
                onChange={e => setLatitud(parseFloat(e.target.value))}
                step={0.0000001}
                min={-90}
                max={90}
                required
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Longitud *</label>
              <input
                style={inputStyle}
                type="number"
                value={longitud}
                onChange={e => setLongitud(parseFloat(e.target.value))}
                step={0.0000001}
                min={-180}
                max={180}
                required
              />
            </div>
          </div>

          {/* Error inline */}
          {error && (
            <div style={{
              background: '#fee2e2', color: '#b91c1c',
              fontSize: 13, padding: '8px 12px',
              borderRadius: 7, marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          {/* Acciones */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                background: '#f5f5f5', color: '#1c1c1e', border: 'none',
                borderRadius: 7, padding: '9px 18px', fontSize: 13,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isValid || loading}
              style={{
                background: !isValid || loading ? '#b0c8e8' : '#0071e3',
                color: '#fff', border: 'none',
                borderRadius: 7, padding: '9px 18px', fontSize: 13,
                fontWeight: 500,
                cursor: !isValid || loading ? 'not-allowed' : 'pointer',
                transition: 'background 150ms ease',
              }}
            >
              {loading ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
