import { useState } from 'react';
import BusquedaForm from './BusquedaForm';
import {
  PORTALES,
  NOMBRE_PORTAL,
  ICONO_TIPO,
  NOMBRE_TIPO,
  type Busqueda,
  type BusquedaFormData,
  type ResultadoRastreo,
} from '../types';

interface Props {
  busquedas: Busqueda[];
  onUpdate: (id: string, data: BusquedaFormData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onToggleHabilitada: (id: string, habilitada: boolean) => Promise<void>;
  onRastrear: (id: string) => Promise<ResultadoRastreo>;
}

function resumenCriterios(b: Busqueda): string {
  const partes: string[] = [];
  if (b.precio_min !== null || b.precio_max !== null) {
    const min = b.precio_min !== null ? `${b.precio_min.toLocaleString('es-ES')} €` : '—';
    const max = b.precio_max !== null ? `${b.precio_max.toLocaleString('es-ES')} €` : '—';
    partes.push(`${min} a ${max}`);
  }
  if (b.metros_min !== null || b.metros_max !== null) {
    partes.push(`${b.metros_min ?? '—'}–${b.metros_max ?? '—'} m²`);
  }
  if (b.habitaciones_min !== null) partes.push(`${b.habitaciones_min}+ hab`);
  if (b.banos_min !== null) partes.push(`${b.banos_min}+ baños`);
  if (b.exige_ascensor) partes.push('ascensor');
  if (b.exige_garaje) partes.push('garaje');
  if (b.exige_terraza) partes.push('terraza');
  return partes.join(' · ') || 'Sin filtros adicionales';
}

function fechaCorta(iso: string | null): string {
  if (!iso) return 'nunca';
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function BusquedaList({ busquedas, onUpdate, onDelete, onToggleHabilitada, onRastrear }: Props) {
  const [editando, setEditando] = useState<string | null>(null);
  const [rastreando, setRastreando] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Record<string, string>>({});

  if (busquedas.length === 0) {
    return <p className="empty-hint">Todavía no hay búsquedas. Crea una arriba y empezará a vigilar sola.</p>;
  }

  const handleRastrear = async (id: string) => {
    setRastreando(id);
    setResultados((prev) => ({ ...prev, [id]: '' }));
    try {
      const r = await onRastrear(id);
      const fallos = r.fallos.map((f) => `${NOMBRE_PORTAL[f.portal]}: ${f.motivo}`).join(' · ');
      setResultados((prev) => ({
        ...prev,
        [id]: `${r.encontrados} encontrados, ${r.guardados} guardados${fallos ? ` — ⚠ ${fallos}` : ''}`,
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
                    <span title={NOMBRE_TIPO[b.tipo]}>{ICONO_TIPO[b.tipo]}</span> {b.nombre}
                  </h3>
                  <p className="busqueda-ubicacion">{b.ubicacion}</p>
                </div>
                <div className="busqueda-portales">
                  {PORTALES.filter((p) => b.portales[p]?.enabled).map((p) => (
                    <span key={p} className="tag">{NOMBRE_PORTAL[p]}</span>
                  ))}
                </div>
              </div>

              <p className="busqueda-criterios">{resumenCriterios(b)}</p>

              <p className="busqueda-meta">
                Último rastreo: {fechaCorta(b.ultimo_rastreo_at)}
                {b.notificar ? ' · avisa por Telegram' : ' · sin avisos'}
              </p>

              {/*
                Un portal caído no puede pasar desapercibido: si el último
                rastreo falló en alguna fuente, el listado que se ve arriba
                está incompleto y hay que decirlo.
              */}
              {b.ultimo_rastreo_error && (
                <p className="busqueda-alerta">⚠ Último rastreo incompleto — {b.ultimo_rastreo_error}</p>
              )}

              {resultados[b.id] && <p className="busqueda-meta">{resultados[b.id]}</p>}

              <div className="busqueda-acciones">
                <button className="btn-secondary" onClick={() => void handleRastrear(b.id)} disabled={rastreando === b.id}>
                  {rastreando === b.id ? 'Buscando…' : 'Buscar ahora'}
                </button>
                <button className="btn-secondary" onClick={() => setEditando(b.id)}>Editar</button>
                <button className="btn-secondary" onClick={() => void onToggleHabilitada(b.id, !b.habilitada)}>
                  {b.habilitada ? 'Pausar' : 'Reanudar'}
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
