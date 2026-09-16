import { useEffect, useRef, useState, type WheelEvent, type MouseEvent as ReactMouseEvent } from 'react';
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

// Ventana de índices visible sobre `datosGrafica` — el zoom/pan no filtra los
// datos en la API, solo recorta qué porción del array ya cargado se pinta.
interface Ventana {
  inicio: number;
  fin: number; // inclusive
}

const PUNTOS_MINIMOS_VENTANA = 4;

export default function PreciosViviendaProvincia() {
  const [provincias, setProvincias] = useState<string[]>([]);
  const [seleccion, setSeleccion] = useState<string>(TOTAL_NACIONAL);
  const [serie, setSerie] = useState<PrecioViviendaPunto[]>([]);
  const [estado, setEstado] = useState<ImportacionEstado | null>(null);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [cargandoSerie, setCargandoSerie] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ventana, setVentana] = useState<Ventana | null>(null);

  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const arrastreRef = useRef<{ xInicial: number; ventanaInicial: Ventana } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

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

  // Cada vez que cambian los datos (nueva selección de provincia/ámbito) se
  // resetea la ventana visible al rango completo — un zoom/pan aplicado a la
  // serie anterior no tendría sentido sobre la nueva.
  useEffect(() => {
    setVentana(datosGrafica.length > 0 ? { inicio: 0, fin: datosGrafica.length - 1 } : null);
  }, [datosGrafica.length, seleccion]);

  const totalPuntos = datosGrafica.length;
  const ventanaCompleta = ventana !== null && ventana.inicio === 0 && ventana.fin === totalPuntos - 1;
  const datosVisibles =
    ventana !== null ? datosGrafica.slice(ventana.inicio, ventana.fin + 1) : datosGrafica;

  const clampVentana = (v: Ventana): Ventana => {
    let { inicio, fin } = v;
    inicio = Math.max(0, Math.min(inicio, totalPuntos - PUNTOS_MINIMOS_VENTANA));
    fin = Math.min(totalPuntos - 1, Math.max(fin, inicio + PUNTOS_MINIMOS_VENTANA - 1));
    return { inicio, fin };
  };

  // Rueda del ratón: acerca (deltaY negativo, scroll "hacia arriba"/hacia la
  // pantalla) o aleja (deltaY positivo) la ventana visible, manteniendo el
  // centro actual fijo. No hace falta arrastrar la página con el scroll, por
  // eso preventDefault().
  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!ventana || totalPuntos <= PUNTOS_MINIMOS_VENTANA) return;
    e.preventDefault();

    const anchoActual = ventana.fin - ventana.inicio;
    const factor = e.deltaY < 0 ? 0.82 : 1.22;
    const anchoNuevo = Math.max(
      PUNTOS_MINIMOS_VENTANA - 1,
      Math.min(totalPuntos - 1, Math.round(anchoActual * factor)),
    );
    const centro = (ventana.inicio + ventana.fin) / 2;
    const nueva = clampVentana({
      inicio: Math.round(centro - anchoNuevo / 2),
      fin: Math.round(centro + anchoNuevo / 2),
    });
    setVentana(nueva);
  };

  // Arrastrar con el botón izquierdo del ratón desplaza la ventana (pan) sin
  // cambiar su anchura — la posición horizontal del ratón se traduce a
  // "puntos" proporcionalmente al ancho del contenedor.
  const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!ventana || ventanaCompleta) return;
    arrastreRef.current = { xInicial: e.clientX, ventanaInicial: ventana };
    setArrastrando(true);
  };

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!arrastreRef.current || !contenedorRef.current) return;
    const anchoContenedorPx = contenedorRef.current.getBoundingClientRect().width || 1;
    const { xInicial, ventanaInicial } = arrastreRef.current;
    const anchoVentana = ventanaInicial.fin - ventanaInicial.inicio;
    const dx = e.clientX - xInicial;
    const deltaIndices = Math.round((-dx / anchoContenedorPx) * anchoVentana);
    setVentana(
      clampVentana({
        inicio: ventanaInicial.inicio + deltaIndices,
        fin: ventanaInicial.fin + deltaIndices,
      }),
    );
  };

  const detenerArrastre = () => {
    arrastreRef.current = null;
    setArrastrando(false);
  };

  const resetearZoom = () => {
    if (totalPuntos > 0) setVentana({ inicio: 0, fin: totalPuntos - 1 });
  };

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

      <div className="precios-vivienda-grafica-barra">
        <p className="precios-vivienda-ayuda-zoom">
          Rueda del ratón para acercar/alejar · arrastra para desplazarte
        </p>
        {!ventanaCompleta && (
          <button type="button" className="precios-vivienda-reset-zoom" onClick={resetearZoom}>
            Ver todo el histórico
          </button>
        )}
      </div>

      <div
        ref={contenedorRef}
        className={`precios-vivienda-grafica${arrastrando ? ' precios-vivienda-grafica--arrastrando' : ''}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={detenerArrastre}
        onMouseLeave={detenerArrastre}
      >
        {cargandoSerie ? (
          <p className="precios-vivienda-cargando">Cargando…</p>
        ) : datosVisibles.length === 0 ? (
          <p className="precios-vivienda-cargando">Sin datos todavía para esta selección.</p>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={datosVisibles} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
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
                isAnimationActive={false}
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
