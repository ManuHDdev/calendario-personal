import { useState } from 'react';
import type { HorarioZona, ZonaCyd } from '../types/zona';

interface HorarioPanelProps {
  zona:      ZonaCyd;
  token:     string;
  onClose:   () => void;
  onSuccess: () => void;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

type TipoDia = 'LMXJV' | 'SABADO' | 'DOMINGO';

const TIPOS: TipoDia[] = ['LMXJV', 'SABADO', 'DOMINGO'];

const LABEL_TIPO: Record<TipoDia, string> = {
  LMXJV:   'L-V',
  SABADO:  'Sábado',
  DOMINGO: 'Domingo',
};

const SELECT_LABEL: Record<TipoDia, string> = {
  LMXJV:   'Lunes-Viernes',
  SABADO:  'Sábado',
  DOMINGO: 'Domingo',
};

// ─── Estilos compartidos ─────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '7px 10px', fontSize: 13,
  border: '1px solid #d1d1d6', borderRadius: 7,
  outline: 'none', fontFamily: 'system-ui, sans-serif',
  color: '#1c1c1e', background: '#fff',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 500,
  color: '#8e8e93', marginBottom: 4,
  textTransform: 'uppercase', letterSpacing: '0.04em',
};

const rowBtnAction: React.CSSProperties = {
  background: 'transparent', border: 'none', borderRadius: 6,
  padding: '5px 12px', fontSize: 12, fontWeight: 500,
  cursor: 'pointer', color: '#1c1c1e',
  transition: 'background 180ms ease',
};

const rowBtnActionHover: React.CSSProperties = { background: '#f0f0f2' };

const rowBtnDanger: React.CSSProperties = {
  background: 'transparent', border: 'none', borderRadius: 6,
  padding: '5px 12px', fontSize: 12, fontWeight: 500,
  cursor: 'pointer', color: '#dc2626',
  transition: 'background 180ms ease',
};

const rowBtnDangerHover: React.CSSProperties = { background: '#fef2f2' };

// ─── Componente ──────────────────────────────────────────────────────────────

export function HorarioPanel({ zona, token, onClose, onSuccess }: HorarioPanelProps) {
  // Lista local — se actualiza tras cada operación para feedback inmediato
  const [horarios, setHorarios] = useState<HorarioZona[]>(
    zona.horarios.filter(h => h.activo),
  );

  // Estado del formulario
  const [tipoDia,     setTipoDia]     = useState<TipoDia>('LMXJV');
  const [horaInicio,  setHoraInicio]  = useState('');
  const [horaFin,     setHoraFin]     = useState('');
  const [editandoId,  setEditandoId]  = useState<string | null>(null);
  const [errorForm,   setErrorForm]   = useState<string | null>(null);
  const [loadingForm, setLoadingForm] = useState(false);

  // Estado de eliminación
  const [horarioAEliminar, setHorarioAEliminar] = useState<HorarioZona | null>(null);
  const [eliminando,       setEliminando]       = useState(false);
  const [errorEliminar,    setErrorEliminar]    = useState<string | null>(null);

  // Hover de los botones Editar/Eliminar de cada franja (estilos inline,
  // sin CSS con pseudo-clases en este componente) — clave = `${id}:accion`
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setTipoDia('LMXJV');
    setHoraInicio('');
    setHoraFin('');
    setEditandoId(null);
    setErrorForm(null);
  };

  const handleEditar = (h: HorarioZona) => {
    setEditandoId(h.id);
    setTipoDia(h.tipo_dia);
    setHoraInicio(h.hora_inicio);
    setHoraFin(h.hora_fin);
    setErrorForm(null);
  };

  const isFormValid = Boolean(horaInicio && horaFin && horaFin > horaInicio);

  // ── Submit añadir / editar ─────────────────────────────────────────────────

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!horaInicio || !horaFin) {
      setErrorForm('Hora de inicio y fin son obligatorias');
      return;
    }
    if (horaFin <= horaInicio) {
      setErrorForm('hora_fin debe ser mayor que hora_inicio');
      return;
    }
    setLoadingForm(true);
    setErrorForm(null);
    const API = import.meta.env.BASE_URL + 'api';
    try {
      const body = { tipo_dia: tipoDia, hora_inicio: horaInicio, hora_fin: horaFin };
      const url    = editandoId
        ? `${API}/zonas/${zona.id}/horarios/${editandoId}`
        : `${API}/zonas/${zona.id}/horarios`;
      const method = editandoId ? 'PUT' : 'POST';
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
      const saved = (await res.json()) as HorarioZona;
      if (editandoId) {
        setHorarios(prev => prev.map(h => h.id === editandoId ? saved : h));
      } else {
        setHorarios(prev => [...prev, saved]);
      }
      resetForm();
      onSuccess();
    } catch (err) {
      setErrorForm(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setLoadingForm(false);
    }
  };

  // ── Confirmar eliminación ──────────────────────────────────────────────────

  const confirmarEliminar = async () => {
    if (!horarioAEliminar) return;
    setEliminando(true);
    setErrorEliminar(null);
    const API = import.meta.env.BASE_URL + 'api';
    try {
      const res = await fetch(
        `${API}/zonas/${zona.id}/horarios/${horarioAEliminar.id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok && res.status !== 204) {
        let msg = `Error ${res.status}`;
        try { const b = (await res.json()) as { error?: string }; if (b.error) msg = b.error; }
        catch { /* ignore */ }
        throw new Error(msg);
      }
      setHorarios(prev => prev.filter(h => h.id !== horarioAEliminar.id));
      setHorarioAEliminar(null);
      onSuccess();
    } catch (err) {
      setErrorEliminar(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setEliminando(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Overlay principal ────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          background: '#fff', borderRadius: 12, padding: 24,
          maxWidth: 520, width: '90%', maxHeight: '88vh', overflowY: 'auto',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          fontFamily: 'system-ui, sans-serif',
        }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e' }}>
              Horarios de {zona.nombre}
            </span>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#8e8e93', padding: 0, lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          {/* Franjas agrupadas por tipo_dia */}
          {horarios.length === 0 ? (
            <div style={{ fontSize: 13, color: '#8e8e93', padding: '12px 0', marginBottom: 8 }}>
              Sin franjas horarias definidas
            </div>
          ) : (
            TIPOS.map(tipo => {
              const franjas = horarios.filter(h => h.tipo_dia === tipo);
              if (franjas.length === 0) return null;
              return (
                <div key={tipo} style={{ marginBottom: 16 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 600, color: '#8e8e93',
                    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
                  }}>
                    {LABEL_TIPO[tipo]}
                  </div>
                  {franjas.map((h, i) => (
                    <div
                      key={h.id}
                      style={{
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '7px 10px',
                        background: i % 2 === 0 ? '#f9f9f9' : '#ffffff',
                        borderRadius: 6, marginBottom: 2,
                      }}
                    >
                      <span style={{ fontSize: 13, color: '#1c1c1e', fontVariantNumeric: 'tabular-nums' }}>
                        {h.hora_inicio} – {h.hora_fin}
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => handleEditar(h)}
                          onMouseEnter={() => setHoveredBtn(`${h.id}:editar`)}
                          onMouseLeave={() => setHoveredBtn(null)}
                          style={hoveredBtn === `${h.id}:editar` ? { ...rowBtnAction, ...rowBtnActionHover } : rowBtnAction}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => { setErrorEliminar(null); setHorarioAEliminar(h); }}
                          onMouseEnter={() => setHoveredBtn(`${h.id}:eliminar`)}
                          onMouseLeave={() => setHoveredBtn(null)}
                          style={hoveredBtn === `${h.id}:eliminar` ? { ...rowBtnDanger, ...rowBtnDangerHover } : rowBtnDanger}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })
          )}

          {/* Separador */}
          <div style={{ borderTop: '1px solid #f0f0f0', margin: '16px 0' }} />

          {/* Formulario añadir / editar */}
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1c1c1e', marginBottom: 12 }}>
            {editandoId ? 'Editar franja' : 'Añadir franja'}
          </div>

          <form onSubmit={handleSubmitForm} noValidate>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 140px' }}>
                <label style={labelStyle}>Tipo día</label>
                <select
                  value={tipoDia}
                  onChange={e => setTipoDia(e.target.value as TipoDia)}
                  style={inputStyle}
                >
                  {TIPOS.map(t => (
                    <option key={t} value={t}>{SELECT_LABEL[t]}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <label style={labelStyle}>Inicio</label>
                <input
                  type="time"
                  value={horaInicio}
                  onChange={e => setHoraInicio(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <label style={labelStyle}>Fin</label>
                <input
                  type="time"
                  value={horaFin}
                  onChange={e => setHoraFin(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>
            </div>

            {errorForm && (
              <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 10 }}>
                {errorForm}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="submit"
                disabled={loadingForm || !isFormValid}
                style={{
                  background: loadingForm || !isFormValid ? '#b0c8e8' : '#0071e3',
                  color: '#fff', border: 'none', borderRadius: 7,
                  padding: '8px 16px', fontSize: 13, fontWeight: 500,
                  cursor: loadingForm || !isFormValid ? 'not-allowed' : 'pointer',
                  transition: 'background 150ms ease',
                }}
              >
                {loadingForm ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Añadir'}
              </button>
              {editandoId && (
                <button
                  type="button"
                  onClick={resetForm}
                  style={{
                    background: '#f5f5f5', color: '#636366', border: 'none',
                    borderRadius: 7, padding: '8px 16px', fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Cancelar edición
                </button>
              )}
            </div>
          </form>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
            <button
              onClick={onClose}
              style={{ background: '#f5f5f5', color: '#1c1c1e', border: 'none', borderRadius: 7, padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal confirmación eliminar ───────────────────────────────────── */}
      {horarioAEliminar && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 1200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: '28px 32px',
            maxWidth: 360, width: '90%',
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            fontFamily: 'system-ui, sans-serif',
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e', marginBottom: 8 }}>
              Eliminar franja
            </div>
            <div style={{ fontSize: 13, color: '#636366', marginBottom: 20, lineHeight: 1.5 }}>
              ¿Eliminar{' '}
              <strong>
                {LABEL_TIPO[horarioAEliminar.tipo_dia]}{' '}
                {horarioAEliminar.hora_inicio}–{horarioAEliminar.hora_fin}
              </strong>?{' '}
              Esta acción no se puede deshacer.
            </div>
            {errorEliminar && (
              <div style={{ background: '#fee2e2', color: '#b91c1c', fontSize: 13, padding: '8px 12px', borderRadius: 7, marginBottom: 16 }}>
                {errorEliminar}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setHorarioAEliminar(null)}
                disabled={eliminando}
                style={{ background: '#f5f5f5', color: '#1c1c1e', border: 'none', borderRadius: 7, padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarEliminar}
                disabled={eliminando}
                style={{
                  background: '#dc2626', color: '#fff', border: 'none',
                  borderRadius: 7, padding: '8px 18px', fontSize: 13,
                  cursor: eliminando ? 'not-allowed' : 'pointer',
                }}
              >
                {eliminando ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
