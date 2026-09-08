import { useState } from 'react';
import BusquedaForm from './BusquedaForm';
import {
  NOMBRE_PORTAL,
  type Busqueda,
  type BusquedaFormData,
  type ResultadoRastreo,
} from '../types';

interface Props {
  busquedas: Busqueda[];
  onUpdate: (id: number, data: BusquedaFormData) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onTogglePar: (id: number, campo: 'habilitada' | 'notificar', valor: boolean, tipo: Busqueda['tipo']) => Promise<void>;
  onRastrear: (id: number) => Promise<ResultadoRastreo>;
}

function resumen(b: Busqueda): string {
  const p: string[] = [];
  if (b.tipo === 'local') {
    if (b.precio_min !== null || b.precio_max !== null) p.push(`${b.precio_min ?? '—'}–${b.precio_max ?? '—'} €`);
    if (b.superficie_min !== null || b.superficie_max !== null) p.push(`${b.superficie_min ?? '—'}–${b.superficie_max ?? '—'} m²`);
    if (b.pie_calle === true) p.push('pie de calle');
    if (b.pie_calle === false) p.push('sin pie de calle');
  } else {
    if (b.facturacion_min !== null || b.facturacion_max !== null) p.push(`facturación ${b.facturacion_min ?? '—'}–${b.facturacion_max ?? '—'} €`);
  }
  if (b.comprobar_farmacias) p.push('mide farmacias');
  if (b.comprobar_centros_sanitarios) p.push('mide centros');
  return p.join(' · ') || 'Sin filtros adicionales';
}

function fecha(iso: string | null): string {
  if (!iso) return 'nunca';
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function BusquedaList({ busquedas, onUpdate, onDelete, onTogglePar, onRastrear }: Props) {
  const [editando, setEditando] = useState<number | null>(null);
  const [rastreando, setRastreando] = useState<number | null>(null);
  const [resultados, setResultados] = useState<Record<number, string>>({});

  if (busquedas.length === 0) {
    return <p className="empty-hint">Todavía no hay búsquedas. Crea una arriba y empezará a vigilar sola.</p>;
  }

  const handleRastrear = async (id: number) => {
    setRastreando(id);
    setResultados((prev) => ({ ...prev, [id]: '' }));
    try {
      const r = await onRastrear(id);
      const fallos = r.fallos.map((f) => `${NOMBRE_PORTAL[f.portal] ?? f.portal}: ${f.motivo}`).join(' · ');
      const omit = r.omitidos.map((o) => `${NOMBRE_PORTAL[o.portal] ?? o.portal}: ${o.motivo}`).join(' · ');
      setResultados((prev) => ({
        ...prev,
        [id]:
          `${r.encontrados} encontrados, ${r.guardados} guardados` +
          (fallos ? ` — ⚠ fallos: ${fallos}` : '') +
          (omit ? ` — omitidos: ${omit}` : ''),
      }));
    } catch (err) {
      setResultados((prev) => ({ ...prev, [id]: `Error: ${err instanceof Error ? err.message : 'desconocido'}` }));
    } finally {
      setRastreando(null);
    }
  };

  const handleBorrar = async (b: Busqueda) => {
    if (!window.confirm(`¿Borrar la búsqueda "${b.nombre}"? Sus anuncios dejarán de listarse.`)) return;
    await onDelete(b.id);
  };

  return (
    <ul className="busqueda-list">
      {busquedas.map((b) => (
        <li key={b.id} className={`busqueda-item${b.habilitada ? '' : ' busqueda-item--pausada'}`}>
          {editando === b.id ? (
            <BusquedaForm
              inicial={b}
              onSubmit={async (data) => {
                await onUpdate(b.id, data);
                setEditando(null);
              }}
              onCancel={() => setEditando(null)}
            />
          ) : (
            <>
              <div className="busqueda-cabecera">
                <div>
                  <h3 className="busqueda-nombre">
                    {b.nombre} <span className="tag">{b.tipo}</span>
                  </h3>
                  <p className="busqueda-ubicacion">
                    {[b.comunidad, b.provincia, b.zona_texto].filter(Boolean).join(' · ') || 'Ámbito nacional'}
                  </p>
                </div>
                <div className="busqueda-portales">
                  {b.portales.map((p) => (
                    <span key={p} className="tag">{NOMBRE_PORTAL[p] ?? p}</span>
                  ))}
                </div>
              </div>

              <p className="busqueda-criterios">{resumen(b)}</p>
              <p className="busqueda-meta">
                Último rastreo: {fecha(b.ultimo_rastreo)}
                {b.notificar ? ' · avisa por Telegram' : ' · sin avisos'}
              </p>

              {b.ultimo_rastreo_error && (
                <p className="busqueda-alerta">⚠ Último rastreo incompleto — {b.ultimo_rastreo_error}</p>
              )}
              {resultados[b.id] && <p className="busqueda-meta">{resultados[b.id]}</p>}

              <div className="busqueda-acciones">
                <button className="btn-secondary" onClick={() => void handleRastrear(b.id)} disabled={rastreando === b.id}>
                  {rastreando === b.id ? 'Rastreando…' : 'Rastrear ahora'}
                </button>
                <button className="btn-secondary" onClick={() => setEditando(b.id)}>Editar</button>
                <button className="btn-secondary" onClick={() => void onTogglePar(b.id, 'habilitada', !b.habilitada, b.tipo)}>
                  {b.habilitada ? 'Pausar' : 'Reanudar'}
                </button>
                <button className="btn-secondary" onClick={() => void onTogglePar(b.id, 'notificar', !b.notificar, b.tipo)}>
                  {b.notificar ? 'Silenciar' : 'Notificar'}
                </button>
                <button className="btn-danger" onClick={() => void handleBorrar(b)}>Borrar</button>
              </div>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
