import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useZonas } from '../hooks/useZonas';
import type { TipoZona, ZonaCyd } from '../types/zona';
import { ZonaModal } from './ZonaModal';
import { HorarioPanel } from './HorarioPanel';

interface AdminPanelProps {
  onClose:           () => void;
  onActivarModoPin:  (tipo: TipoZona) => void;
  onZonaCreada:      () => void;
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const S = {
  sidebar: {
    position: 'fixed' as const,
    top: 0, right: 0, bottom: 0,
    width: 420,
    background: '#ffffff',
    boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
    // Tenía z-index 900, por debajo de TODOS los controles flotantes
    // ambiente (preferencia de ciudad, selector de ciudad, botón "Panel
    // Admin", panel de apps — todos en 1000/1001). Al estar más abajo en
    // el stacking order, esos controles interceptaban los clics del propio
    // sidebar (empezando por el botón de cerrar, que cae justo debajo de
    // "Preferencia de ciudad" en la esquina superior derecha). 1050 lo deja
    // por encima de esa capa ambiente y por debajo de los modales que se
    // abren desde dentro del panel (ZonaModal/HorarioPanel, 1100+).
    zIndex: 1050,
    display: 'flex',
    flexDirection: 'column' as const,
    fontFamily: 'system-ui, sans-serif',
    overflowY: 'hidden' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 24px',
    borderBottom: '1px solid #f0f0f0',
    flexShrink: 0,
  },
  headerTitle: { fontSize: 15, fontWeight: 600, color: '#1c1c1e' },
  btnClose: {
    background: 'none', border: 'none', fontSize: 22,
    cursor: 'pointer', color: '#8e8e93', lineHeight: 1, padding: 0,
  },
  toolbar: {
    padding: '12px 24px',
    borderBottom: '1px solid #f0f0f0',
    flexShrink: 0,
  },
  btnPrimary: {
    background: '#0071e3', color: '#fff', border: 'none',
    borderRadius: 7, padding: '8px 16px', fontSize: 13,
    fontWeight: 500, cursor: 'pointer',
  },
  tableWrap: { flex: 1, overflowY: 'auto' as const },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: {
    textAlign: 'left' as const, padding: '10px 16px',
    fontSize: 11, fontWeight: 600, color: '#8e8e93',
    textTransform: 'uppercase' as const, letterSpacing: '0.04em',
    borderBottom: '1px solid #f0f0f0', position: 'sticky' as const, top: 0,
    background: '#fff',
  },
  tdBase: { padding: '10px 16px', verticalAlign: 'middle' as const },
  actionsGroup: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  btnAction: {
    background: 'transparent', border: 'none',
    borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', color: '#1c1c1e',
    transition: 'background 180ms ease',
  },
  btnActionHover: { background: '#f0f0f2' },
  btnDanger: {
    background: 'transparent', border: 'none',
    borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', color: '#dc2626',
    transition: 'background 180ms ease',
  },
  btnDangerHover: { background: '#fef2f2' },
  // Modal de confirmación
  overlay: {
    position: 'fixed' as const, inset: 0,
    background: 'rgba(0,0,0,0.35)', zIndex: 1100,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: '#fff', borderRadius: 12, padding: '28px 32px',
    maxWidth: 360, width: '90%',
    boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
    fontFamily: 'system-ui, sans-serif',
  },
  modalTitle: { fontSize: 15, fontWeight: 600, color: '#1c1c1e', marginBottom: 8 },
  modalText:  { fontSize: 13, color: '#636366', marginBottom: 24, lineHeight: 1.5 },
  modalActions: { display: 'flex', gap: 10, justifyContent: 'flex-end' },
  btnSecondary: {
    background: '#f5f5f5', color: '#1c1c1e', border: 'none',
    borderRadius: 7, padding: '8px 18px', fontSize: 13, cursor: 'pointer',
  },
  btnDestructive: {
    background: '#dc2626', color: '#fff', border: 'none',
    borderRadius: 7, padding: '8px 18px', fontSize: 13, cursor: 'pointer',
  },
  emptyRow: { padding: '32px 16px', textAlign: 'center' as const, color: '#8e8e93', fontSize: 13 },
  errorBanner: {
    margin: '12px 24px', padding: '10px 14px',
    background: '#fee2e2', color: '#b91c1c',
    borderRadius: 7, fontSize: 13,
  },
};

// ─── Componente ──────────────────────────────────────────────────────────────

export function AdminPanel({ onClose, onActivarModoPin, onZonaCreada }: AdminPanelProps) {
  const { token }                     = useAuth();
  const { zonas, loading, error, refetch } = useZonas();

  const [zonaEditar,    setZonaEditar]    = useState<ZonaCyd | null>(null);
  const [zonaHorarios,  setZonaHorarios]  = useState<ZonaCyd | null>(null);
  const [zonaEliminar,  setZonaEliminar]  = useState<ZonaCyd | null>(null);
  const [eliminando,    setEliminando]    = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);
  // Hover de los botones de acción de fila (no hay CSS con pseudo-clases
  // aquí, los estilos son objetos inline) — clave = `${zonaId}:accion`
  const [hoveredBtn, setHoveredBtn]       = useState<string | null>(null);

  // ── Eliminar ───────────────────────────────────────────────────────────────
  const confirmarEliminar = async () => {
    if (!zonaEliminar || !token) return;
    setEliminando(true);
    setErrorEliminar(null);
    const API = import.meta.env.BASE_URL + 'api';
    try {
      const res = await fetch(`${API}/zonas/${zonaEliminar.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) {
        let msg = `Error ${res.status}`;
        try { const b = (await res.json()) as { error?: string }; if (b.error) msg = b.error; }
        catch { /* ignore */ }
        throw new Error(msg);
      }
      setZonaEliminar(null);
      await refetch();
      onZonaCreada();
    } catch (err) {
      setErrorEliminar(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setEliminando(false);
    }
  };

  // ── Tras guardar zona o cambiar horario ────────────────────────────────────
  const handleGuardado = async () => {
    setZonaEditar(null);
    await refetch();
    onZonaCreada();
  };

  const handleCambioHorario = async () => {
    await refetch();
    onZonaCreada();
  };

  return (
    <>
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <div style={S.sidebar}>

        {/* Header */}
        <div style={S.header}>
          <span style={S.headerTitle}>Zonas de carga / descarga</span>
          <button style={S.btnClose} onClick={onClose} title="Cerrar">×</button>
        </div>

        {/* Toolbar */}
        <div style={{ ...S.toolbar, display: 'flex', gap: 8 }}>
          <button
            style={S.btnPrimary}
            onClick={() => { onActivarModoPin('carga_descarga'); onClose(); }}
          >
            + Nueva zona C/D
          </button>
          <button
            style={{ ...S.btnPrimary, background: '#3b82f6' }}
            onClick={() => { onActivarModoPin('aparcamiento'); onClose(); }}
          >
            + Spot aparcamiento
          </button>
        </div>

        {/* Error carga */}
        {error && <div style={S.errorBanner}>{error}</div>}

        {/* Tabla */}
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Nombre</th>
                <th style={S.th}>Ciudad</th>
                <th style={S.th}>Horarios</th>
                <th style={S.th}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} style={S.emptyRow}>Cargando…</td>
                </tr>
              )}
              {!loading && zonas.length === 0 && (
                <tr>
                  <td colSpan={4} style={S.emptyRow}>No hay zonas registradas.</td>
                </tr>
              )}
              {zonas.map((zona, i) => {
                const nHorarios = zona.horarios.filter(h => h.activo).length;
                const rowBg = i % 2 === 1 ? '#fafafa' : '#ffffff';
                return (
                  <tr key={zona.id} style={{ background: rowBg }}>
                    <td style={{ ...S.tdBase, fontWeight: 500, color: '#1c1c1e' }}>
                      {zona.tipo === 'aparcamiento' ? '🅿️ ' : ''}{zona.nombre}
                    </td>
                    <td style={{ ...S.tdBase, color: '#636366' }}>{zona.ciudad}</td>
                    <td style={{ ...S.tdBase, color: '#636366', textAlign: 'center' }}>
                      {zona.tipo === 'aparcamiento' ? '—' : nHorarios}
                    </td>
                    <td style={S.tdBase}>
                      <div style={S.actionsGroup}>
                        {zona.tipo !== 'aparcamiento' && (
                          <button
                            style={hoveredBtn === `${zona.id}:horarios` ? { ...S.btnAction, ...S.btnActionHover } : S.btnAction}
                            onClick={() => setZonaHorarios(zona)}
                            onMouseEnter={() => setHoveredBtn(`${zona.id}:horarios`)}
                            onMouseLeave={() => setHoveredBtn(null)}
                            title="Gestionar horarios"
                          >
                            Horarios
                          </button>
                        )}
                        <button
                          style={hoveredBtn === `${zona.id}:editar` ? { ...S.btnAction, ...S.btnActionHover } : S.btnAction}
                          onClick={() => setZonaEditar(zona)}
                          onMouseEnter={() => setHoveredBtn(`${zona.id}:editar`)}
                          onMouseLeave={() => setHoveredBtn(null)}
                          title="Editar zona"
                        >
                          Editar
                        </button>
                        <button
                          style={hoveredBtn === `${zona.id}:eliminar` ? { ...S.btnDanger, ...S.btnDangerHover } : S.btnDanger}
                          onClick={() => { setErrorEliminar(null); setZonaEliminar(zona); }}
                          onMouseEnter={() => setHoveredBtn(`${zona.id}:eliminar`)}
                          onMouseLeave={() => setHoveredBtn(null)}
                          title="Eliminar zona"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal editar / crear ───────────────────────────────────────────── */}
      {zonaEditar && (
        <ZonaModal
          modo="editar"
          zona={zonaEditar}
          latitudInicial={zonaEditar.latitud}
          longitudInicial={zonaEditar.longitud}
          onClose={() => setZonaEditar(null)}
          onSuccess={handleGuardado}
        />
      )}

      {/* ── HorarioPanel ──────────────────────────────────────────────────── */}
      {zonaHorarios && (
        <HorarioPanel
          zona={zonaHorarios}
          token={token ?? ''}
          onClose={() => setZonaHorarios(null)}
          onSuccess={handleCambioHorario}
        />
      )}

      {/* ── Modal confirmación eliminar ────────────────────────────────────── */}
      {zonaEliminar && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <div style={S.modalTitle}>Eliminar zona</div>
            <div style={S.modalText}>
              ¿Eliminar <strong>"{zonaEliminar.nombre}"</strong>?
              Esta acción no se puede deshacer.
            </div>
            {errorEliminar && (
              <div style={{ ...S.errorBanner, margin: '0 0 16px 0' }}>{errorEliminar}</div>
            )}
            <div style={S.modalActions}>
              <button
                style={S.btnSecondary}
                onClick={() => setZonaEliminar(null)}
                disabled={eliminando}
              >
                Cancelar
              </button>
              <button
                style={S.btnDestructive}
                onClick={confirmarEliminar}
                disabled={eliminando}
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
