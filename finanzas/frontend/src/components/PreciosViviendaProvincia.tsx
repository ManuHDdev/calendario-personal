import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { getProvincias, getPreciosVivienda, getEstadoImportacion, TOTAL_NACIONAL } from '../services/api';
import type { PrecioViviendaPunto, ImportacionEstado } from '../services/api';
import { aDatosGrafica, formatearHace } from '../lib/preciosVivienda';
import { formatEUR } from '../lib/format';
import './PreciosViviendaProvincia.css';

export default function PreciosViviendaProvincia() {
  const [provincias, setProvincias] = useState<string[]>([]);
  const [seleccion, setSeleccion] = useState<string>(TOTAL_NACIONAL);
  const [serie, setSerie] = useState<PrecioViviendaPunto[]>([]);
  const [estado, setEstado] = useState<ImportacionEstado | null>(null);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [cargandoSerie, setCargandoSerie] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    Promise.all([getProvincias(), getEstadoImportacion()])
      .then(([listaProvincias, estadoImportacion]) => {
        if (cancelado) return;
        setProvincias(listaProvincias);
        setEstado(estadoImportacion);
      })
      .catch((err: unknown) => {
        if (!cancelado) setError(err instanceof Error ? err.message : 'Error cargando datos');
      })
      .finally(() => {
        if (!cancelado) setCargandoLista(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    setCargandoSerie(true);
    setError(null);
    getPreciosVivienda(seleccion)
      .then((puntos) => {
        if (!cancelado) setSerie(puntos);
      })
      .catch((err: unknown) => {
        if (!cancelado) setError(err instanceof Error ? err.message : 'Error cargando la serie');
      })
      .finally(() => {
        if (!cancelado) setCargandoSerie(false);
      });
    return () => {
      cancelado = true;
    };
  }, [seleccion]);

  const datosGrafica = aDatosGrafica(serie);
  const ultimoPunto = [...serie].reverse().find((p) => p.precio_m2 !== null);

  return (
    <div className="precios-vivienda">
      <div className="precios-vivienda-cabecera">
        <div className="calculator-select">
          <span>Provincia / ámbito</span>
          <select
            value={seleccion}
            onChange={(e) => setSeleccion(e.target.value)}
            disabled={cargandoLista}
          >
            <option value={TOTAL_NACIONAL}>Total nacional</option>
            {provincias.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {ultimoPunto && (
          <div className="precios-vivienda-ultimo">
            <span className="precios-vivienda-ultimo-valor">{formatEUR(ultimoPunto.precio_m2 ?? 0)}/m²</span>
            <span className="precios-vivienda-ultimo-periodo">
              último dato: T{ultimoPunto.trimestre} {ultimoPunto.anio}
            </span>
          </div>
        )}
      </div>

      {error && <div className="calculator-card-error">{error}</div>}

      <div className="precios-vivienda-grafica">
        {cargandoSerie ? (
          <p className="precios-vivienda-cargando">Cargando…</p>
        ) : datosGrafica.length === 0 ? (
          <p className="precios-vivienda-cargando">Sin datos todavía para esta selección.</p>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={datosGrafica} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="etiqueta"
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                width={60}
                tickFormatter={(v: number) => `${v}€`}
              />
              <Tooltip
                formatter={(value) => (value === null || value === undefined ? 'sin dato' : formatEUR(Number(value)))}
                contentStyle={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 13,
                }}
              />
              <Line
                type="monotone"
                dataKey="precio"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <p className="precios-vivienda-nota">
        Fuente: Ministerio de Transportes y Movilidad Sostenible (valor tasado medio de vivienda
        libre, €/m²). No es un dato en directo — se actualiza periódicamente.{' '}
        {estado && (
          <>
            Última actualización: <strong>{formatearHace(estado.ultima_ejecucion)}</strong>
            {estado.ultima_ejecucion_ok === false && (
              <span className="precios-vivienda-aviso"> (la última importación falló, mostrando el último dato disponible)</span>
            )}
          </>
        )}
      </p>
    </div>
  );
}
