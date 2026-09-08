import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCobertura,
  getEstadoImportPadron,
  getPadronResumen,
  importarPadron,
} from '../services/api';
import {
  COMUNIDADES,
  NOMBRE_COMUNIDAD,
  type CoberturaMunicipio,
  type EstadoPadron,
  type PadronResumen,
} from '../types';

const nombre = (c: string) => NOMBRE_COMUNIDAD[c] ?? c;

function farmaciasDe(resumen: unknown): number | null {
  const r = resumen as { farmaciasImportadas?: number } | undefined;
  return typeof r?.farmaciasImportadas === 'number' ? r.farmaciasImportadas : null;
}

export default function VistaCobertura() {
  const [filas, setFilas] = useState<CoberturaMunicipio[]>([]);
  const [resumen, setResumen] = useState<PadronResumen | null>(null);
  const [error, setError] = useState('');
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [estado, setEstado] = useState<EstadoPadron | null>(null);
  const [lanzando, setLanzando] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cargarDatos = useCallback(async () => {
    const [c, r] = await Promise.all([getCobertura(true), getPadronResumen()]);
    setFilas(c);
    setResumen(r);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await cargarDatos();
        setEstado(await getEstadoImportPadron());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar la cobertura');
      }
    })();
  }, [cargarDatos]);

  const importando = estado?.estado === 'importando';

  useEffect(() => {
    if (!importando) return;
    const detener = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const e = await getEstadoImportPadron();
          setEstado(e);
          if (e.estado === 'inactivo') {
            detener();
            await cargarDatos();
          }
        } catch {
          /* un fallo puntual de red no debe cortar el sondeo */
        }
      })();
    }, 3000);
    return detener;
  }, [importando, cargarDatos]);

  const lanzar = async (comunidades: string[]) => {
    setLanzando(true);
    setError('');
    try {
      await importarPadron(comunidades);
      setEstado(await getEstadoImportPadron());
      setSeleccion(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo lanzar la importación');
    } finally {
      setLanzando(false);
    }
  };

  const toggle = (c: string) => {
    setSeleccion((prev) => {
      const s = new Set(prev);
      if (s.has(c)) s.delete(c);
      else s.add(c);
      return s;
    });
  };

  if (error) return <p className="feed-alerta">{error}</p>;

  const totalFarmacias = resumen?.farmacias.reduce((s, f) => s + f.total, 0) ?? 0;
  const totalCentros = resumen?.centros.reduce((s, f) => s + f.total, 0) ?? 0;

  const porComunidad = new Map<string, { total: number; ultima: string | null }>();
  for (const f of resumen?.farmacias ?? []) {
    const prev = porComunidad.get(f.comunidad) ?? { total: 0, ultima: null };
    prev.total += f.total;
    if (f.ultima_importacion && (!prev.ultima || f.ultima_importacion > prev.ultima)) {
      prev.ultima = f.ultima_importacion;
    }
    porComunidad.set(f.comunidad, prev);
  }

  const total = estado
    ? estado.hechas.length + estado.cola.length + (estado.comunidadActual ? 1 : 0)
    : 0;

  return (
    <div className="cobertura">
      <p className="cobertura-resumen">
        Padrón cargado: <strong>{totalFarmacias.toLocaleString('es-ES')}</strong> farmacias ·{' '}
        <strong>{totalCentros.toLocaleString('es-ES')}</strong> centros sanitarios.
        {' '}Municipios con padrón incompleto: <strong>{filas.length}</strong>.
      </p>

      <h4 className="cobertura-titulo">Estado del padrón</h4>
      <p className="empty-hint">
        Importar consulta Overpass comunidad por comunidad; tarda 20-60 s cada una. El
        planificador ya refresca el padrón solo una vez por semana: esto es para adelantarlo
        a demanda.
      </p>

      <div className="cobertura-acciones">
        <button
          className="btn-primary"
          onClick={() => void lanzar([...seleccion])}
          disabled={importando || lanzando || seleccion.size === 0}
        >
          Importar seleccionadas
        </button>
        <button
          className="btn-secondary"
          onClick={() => void lanzar(['todas'])}
          disabled={importando || lanzando}
        >
          Importar / refrescar todas
        </button>
      </div>

      {estado && (importando || estado.hechas.length > 0) && (
        <div className="cobertura-progreso">
          {importando ? (
            <p>
              Importando{' '}
              <strong>{estado.comunidadActual ? nombre(estado.comunidadActual) : '…'}</strong>
              {' '}· {estado.hechas.length}/{total}
            </p>
          ) : (
            <p>Última importación terminada: {estado.hechas.length} comunidad(es).</p>
          )}
          <ul className="cobertura-resultados">
            {estado.hechas.map((h, i) => (
              <li key={i} className={h.ok ? 'ok' : 'ko'}>
                {h.ok
                  ? `✓ ${nombre(h.comunidad)} — farmacias:${farmaciasDe(h.resumen) ?? '?'}`
                  : `✗ ${nombre(h.comunidad)} — ${h.error ?? 'error'}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="tabla-scroll">
        <table className="tabla">
          <thead>
            <tr>
              <th>Comunidad</th>
              <th>Farmacias</th>
              <th>Última importación</th>
              <th>Importar</th>
            </tr>
          </thead>
          <tbody>
            {COMUNIDADES.map((c) => {
              const d = porComunidad.get(c);
              return (
                <tr key={c}>
                  <td>{nombre(c)}</td>
                  <td>{d ? d.total.toLocaleString('es-ES') : '—'}</td>
                  <td>{d?.ultima ? new Date(d.ultima).toLocaleDateString('es-ES') : '—'}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={seleccion.has(c)}
                      disabled={importando}
                      onChange={() => toggle(c)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {resumen && resumen.farmacias.length > 0 && (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr><th>Comunidad</th><th>Fuente</th><th>Farmacias</th><th>Duplicados</th><th>Última importación</th></tr>
            </thead>
            <tbody>
              {resumen.farmacias.map((f, i) => (
                <tr key={i}>
                  <td>{f.comunidad}</td>
                  <td>{f.fuente}</td>
                  <td>{f.total}</td>
                  <td>{f.duplicados}</td>
                  <td>{f.ultima_importacion ? new Date(f.ultima_importacion).toLocaleDateString('es-ES') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h4 className="cobertura-titulo">Municipios donde no fiarse de un verde</h4>
      {filas.length === 0 ? (
        <p className="empty-hint">Ningún municipio marcado como incompleto.</p>
      ) : (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr><th>Municipio</th><th>Provincia</th><th>Conocidas</th><th>Esperadas</th><th>Población</th><th>Motivo</th></tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i}>
                  <td>{f.municipio}</td>
                  <td>{f.provincia ?? '—'}</td>
                  <td>{f.farmacias_conocidas}</td>
                  <td>{f.farmacias_esperadas ?? '—'}</td>
                  <td>{f.poblacion !== null ? f.poblacion.toLocaleString('es-ES') : '—'}</td>
                  <td>{f.motivo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
