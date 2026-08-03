import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import type { HorarioZona, TipoZona, ZonaCyd } from '../types/zona';

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

// ─── Horario embebido (solo al crear zona de carga/descarga) ────────────────

type TipoDia = HorarioZona['tipo_dia'];

interface FranjaNueva {
  tipo_dia:    TipoDia;
  hora_inicio: string;
  hora_fin:    string;
}

const TIPOS_DIA: TipoDia[] = ['LMXJV', 'SABADO', 'DOMINGO'];

const SELECT_LABEL_DIA: Record<TipoDia, string> = {
  LMXJV:   'Lunes-Viernes',
  SABADO:  'Sábado',
  DOMINGO: 'Domingo',
};

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

  // Horario embebido — solo aplica al crear una zona de carga/descarga
  const mostrarHorario = modo === 'crear' && tipoActual === 'carga_descarga';

  const [franjas,        setFranjas]        = useState<FranjaNueva[]>([]);
  const [franjaTipoDia,  setFranjaTipoDia]  = useState<TipoDia>('LMXJV');
  const [franjaHoraIni,  setFranjaHoraIni]  = useState('');
  const [franjaHoraFin,  setFranjaHoraFin]  = useState('');
  const [errorFranja,    setErrorFranja]    = useState<string | null>(null);
  // Zona ya persistida en un intento previo (falló algún horario) — evita
  // reenviar el POST de la zona en el reintento, solo se reintentan horarios.
  const [zonaGuardada, setZonaGuardada]     = useState<ZonaCyd | null>(null);

  const isValid =
    nombre.trim().length > 0 &&
    ciudad.trim().length > 0 &&
    latitud >= -90  && latitud <= 90 &&
    longitud >= -180 && longitud <= 180;

  const canSubmit = (zonaGuardada ? true : isValid) && !loading;

  const handleAddFranja = () => {
    if (!franjaHoraIni || !franjaHoraFin) {
      setErrorFranja('Hora de inicio y fin son obligatorias');
      return;
    }
    if (franjaHoraFin <= franjaHoraIni) {
      setErrorFranja('hora_fin debe ser mayor que hora_inicio');
      return;
    }
    setFranjas(prev => [...prev, { tipo_dia: franjaTipoDia, hora_inicio: franjaHoraIni, hora_fin: franjaHoraFin }]);
    setFranjaTipoDia('LMXJV');
    setFranjaHoraIni('');
    setFranjaHoraFin('');
    setErrorFranja(null);
  };

  const handleQuitarFranja = (index: number) => {
    setFranjas(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !canSubmit) return;
    setLoading(true);
    setError(null);
    const API = import.meta.env.BASE_URL + 'api';
    try {
      let saved = zonaGuardada;
      if (!saved) {
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
        saved = (await res.json()) as ZonaCyd;
        if (mostrarHorario) setZonaGuardada(saved);
      }

      if (mostrarHorario && franjas.length > 0) {
        const pendientes: FranjaNueva[] = [];
        for (const franja of franjas) {
          try {
            const resH = await fetch(`${API}/zonas/${saved.id}/horarios`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(franja),
            });
            if (!resH.ok) {
              let msg = `Error ${resH.status}`;
              try { const b = (await resH.json()) as { error?: string }; if (b.error) msg = b.error; }
              catch { /* ignore */ }
              throw new Error(msg);
            }
          } catch {
            pendientes.push(franja);
          }
        }
        setFranjas(pendientes);
        if (pendientes.length > 0) {
          setError(
            `La zona se ha creado, pero ${pendientes.length} franja(s) horaria(s) no se pudieron guardar. ` +
            'Puedes reintentar o gestionarlas después desde "Horarios".',
          );
          return;
        }
      }

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
              disabled={!!zonaGuardada}
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
              disabled={!!zonaGuardada}
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
              disabled={!!zonaGuardada}
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
                disabled={!!zonaGuardada}
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
                disabled={!!zonaGuardada}
              />
            </div>
          </div>

          {/* Horario (opcional, solo al crear zona de carga/descarga) */}
          {mostrarHorario && (
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>Horario (opcional)</div>

              {franjas.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {franjas.map((f, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 10px', background: '#f9f9f9', borderRadius: 6, marginBottom: 4,
                      }}
                    >
                      <span style={{ fontSize: 13, color: '#1c1c1e', fontVariantNumeric: 'tabular-nums' }}>
                        {SELECT_LABEL_DIA[f.tipo_dia]}: {f.hora_inicio} – {f.hora_fin}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleQuitarFranja(i)}
                        disabled={loading}
                        style={{
                          background: 'none', border: 'none', color: '#dc2626',
                          fontSize: 12, fontWeight: 500,
                          cursor: loading ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 140px' }}>
                  <label style={labelStyle}>Tipo día</label>
                  <select
                    value={franjaTipoDia}
                    onChange={e => setFranjaTipoDia(e.target.value as TipoDia)}
                    style={inputStyle}
                    disabled={loading}
                  >
                    {TIPOS_DIA.map(t => (
                      <option key={t} value={t}>{SELECT_LABEL_DIA[t]}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: '1 1 100px' }}>
                  <label style={labelStyle}>Inicio</label>
                  <input
                    type="time"
                    value={franjaHoraIni}
                    onChange={e => setFranjaHoraIni(e.target.value)}
                    style={inputStyle}
                    disabled={loading}
                  />
                </div>
                <div style={{ flex: '1 1 100px' }}>
                  <label style={labelStyle}>Fin</label>
                  <input
                    type="time"
                    value={franjaHoraFin}
                    onChange={e => setFranjaHoraFin(e.target.value)}
                    style={inputStyle}
                    disabled={loading}
                  />
                </div>
              </div>

              {errorFranja && (
                <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>
                  {errorFranja}
                </div>
              )}

              <button
                type="button"
                onClick={handleAddFranja}
                disabled={loading}
                style={{
                  background: '#f5f5f7', color: '#1c1c1e', border: 'none',
                  borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 500,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                Añadir franja
              </button>
            </div>
          )}

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
              onClick={() => { if (zonaGuardada) onSuccess(zonaGuardada); onClose(); }}
              disabled={loading}
              style={{
                background: '#f5f5f5', color: '#1c1c1e', border: 'none',
                borderRadius: 7, padding: '9px 18px', fontSize: 13,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {zonaGuardada ? 'Cerrar' : 'Cancelar'}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                background: !canSubmit ? '#b0c8e8' : '#0071e3',
                color: '#fff', border: 'none',
                borderRadius: 7, padding: '9px 18px', fontSize: 13,
                fontWeight: 500,
                cursor: !canSubmit ? 'not-allowed' : 'pointer',
                transition: 'background 150ms ease',
              }}
            >
              {loading ? 'Guardando…' : zonaGuardada ? 'Guardar horarios' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
