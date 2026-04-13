import type { ZonaCyd } from '../types/zona';

interface HorarioPanelProps {
  zona:     ZonaCyd;
  onClose:  () => void;
  onCambio: () => void;
}

export function HorarioPanel({ zona, onClose }: HorarioPanelProps) {
  const horarios = zona.horarios.filter(h => h.activo);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: '28px 32px',
        maxWidth: 480, width: '90%', boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e' }}>
            Horarios — {zona.nombre}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#8e8e93' }}
          >
            ×
          </button>
        </div>

        {horarios.length === 0 ? (
          <div style={{ fontSize: 13, color: '#8e8e93', marginBottom: 24 }}>
            Sin franjas horarias registradas.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 24 }}>
            <thead>
              <tr>
                {['Tipo día', 'Inicio', 'Fin'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', borderBottom: '1px solid #f0f0f0' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {horarios.map((h, i) => (
                <tr key={h.id} style={{ background: i % 2 === 1 ? '#fafafa' : '#fff' }}>
                  <td style={{ padding: '8px 12px', color: '#636366' }}>{h.tipo_dia}</td>
                  <td style={{ padding: '8px 12px' }}>{h.hora_inicio}</td>
                  <td style={{ padding: '8px 12px' }}>{h.hora_fin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ fontSize: 13, color: '#8e8e93', marginBottom: 24 }}>
          Gestión de horarios (próximamente)
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: '#f5f5f5', color: '#1c1c1e', border: 'none',
              borderRadius: 7, padding: '8px 18px', fontSize: 13, cursor: 'pointer',
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
