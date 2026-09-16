import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
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

type DominioY = [number, number];

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
  const [dominioY, setDominioY] = useState<DominioY | null>(null);
  const [dominioYBase, setDominioYBase] = useState<DominioY | null>(null);

  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const arrastreRef = useRef<{
    xInicial: number;
    yInicial: number;
    ventanaInicial: Ventana;
    dominioYInicial: DominioY;
  } | null>(null);
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
  // resetea la ventana visible (X) y el dominio vertical (Y) — un zoom/pan
  // aplicado a la serie anterior no tendría sentido sobre la nueva.
  useEffect(() => {
    if (datosGrafica.length === 0) {
      setVentana(null);
      setDominioY(null);
      setDominioYBase(null);
      return;
    }
    setVentana({ inicio: 0, fin: datosGrafica.length - 1 });

    const valores = datosGrafica
      .map((p) => p.precio)
      .filter((v): v is number => v !== null && Number.isFinite(v));
    if (valores.length === 0) {
      setDominioY(null);
      setDominioYBase(null);
      return;
    }
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const relleno = Math.max((max - min) * 0.1, 1);
    // Redondeado a € enteros: al fijar un dominio numérico explícito,
    // Recharts pinta el min/max exactos como ticks del eje, y sin redondear
    // aquí saldría ruido de coma flotante (ej. "506.30999999999995€").
    const base: DominioY = [Math.round(min - relleno), Math.round(max + relleno)];
    setDominioY(base);
    setDominioYBase(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccion, datosGrafica.length]);

  const totalPuntos = datosGrafica.length;
  const ventanaCompleta = ventana !== null && ventana.inicio === 0 && ventana.fin === totalPuntos - 1;
  const yEnBase =
    dominioY !== null &&
    dominioYBase !== null &&
    Math.abs(dominioY[0] - dominioYBase[0]) < 1e-6 &&
    Math.abs(dominioY[1] - dominioYBase[1]) < 1e-6;
  const vistaCompleta = ventanaCompleta && yEnBase;
  const datosVisibles =
    ventana !== null ? datosGrafica.slice(ventana.inicio, ventana.fin + 1) : datosGrafica;

  const clampVentana = (v: Ventana): Ventana => {
    let { inicio, fin } = v;
    inicio = Math.max(0, Math.min(inicio, totalPuntos - PUNTOS_MINIMOS_VENTANA));
    fin = Math.min(totalPuntos - 1, Math.max(fin, inicio + PUNTOS_MINIMOS_VENTANA - 1));
    return { inicio, fin };
  };

  // El pan vertical mantiene la misma anchura de dominio (no hay zoom en Y,
  // solo desplazamiento), pero no deja alejarse tanto que el rango visible
  // deje de solapar con los datos reales — evita quedarse "perdido" en un
  // hueco vacío.
  const clampDominioY = (d: DominioY): DominioY => {
    if (!dominioYBase) return d;
    const anchura = d[1] - d[0];
    const [baseMin, baseMax] = dominioYBase;
    let [min, max] = d;
    if (max < baseMin) {
      min = baseMin - anchura * 0.2;
      max = min + anchura;
    }
    if (min > baseMax) {
      max = baseMax + anchura * 0.2;
      min = max - anchura;
    }
    return [min, max];
  };

  // Rueda del ratón: acerca (deltaY negativo, scroll "hacia arriba"/hacia la
  // pantalla) o aleja (deltaY positivo) la ventana horizontal, manteniendo el
  // centro actual fijo.
  //
  // Se engancha como listener NATIVO (no como prop `onWheel` de React) con
  // `{ passive: false }`: React 17+ registra los listeners de wheel/touch
  // como pasivos por defecto, y ahí `e.preventDefault()` no hace nada (el
  // navegador avisa en consola "Unable to preventDefault inside passive
  // event listener invocation") — la página se desplazaría a la vez que se
  // hace zoom en la gráfica.
  useEffect(() => {
    const el = contenedorRef.current;
    if (!el) return;

    const onWheelNativo = (e: globalThis.WheelEvent) => {
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

    el.addEventListener('wheel', onWheelNativo, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNativo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventana, totalPuntos]);

  // Arrastrar con el botón izquierdo del ratón mueve la gráfica en las dos
  // direcciones: horizontal cambia qué tramo de tiempo se ve (pan de la
  // ventana de índices), vertical desplaza el rango de precios visible sin
  // cambiar su amplitud — igual que arrastrar un mapa.
  const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!ventana || !dominioY) return;
    arrastreRef.current = {
      xInicial: e.clientX,
      yInicial: e.clientY,
      ventanaInicial: ventana,
      dominioYInicial: dominioY,
    };
    setArrastrando(true);
  };

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!arrastreRef.current || !contenedorRef.current) return;
    const rect = contenedorRef.current.getBoundingClientRect();
    const { xInicial, yInicial, ventanaInicial, dominioYInicial } = arrastreRef.current;

    const anchoContenedorPx = rect.width || 1;
    const anchoVentana = ventanaInicial.fin - ventanaInicial.inicio;
    const dx = e.clientX - xInicial;
    const deltaIndices = Math.round((-dx / anchoContenedorPx) * anchoVentana);
    setVentana(
      clampVentana({
        inicio: ventanaInicial.inicio + deltaIndices,
        fin: ventanaInicial.fin + deltaIndices,
      }),
    );

    const altoContenedorPx = rect.height || 1;
    const anchoDominioY = dominioYInicial[1] - dominioYInicial[0];
    const dy = e.clientY - yInicial;
    // Arrastrar hacia abajo revela valores más bajos (como desplazarse hacia
    // abajo por una lista) — el eje Y del gráfico crece hacia arriba.
    const deltaValor = (dy / altoContenedorPx) * anchoDominioY;
    setDominioY(clampDominioY([dominioYInicial[0] - deltaValor, dominioYInicial[1] - deltaValor]));
  };

  const detenerArrastre = () => {
    arrastreRef.current = null;
    setArrastrando(false);
  };

  const resetearZoom = () => {
    if (totalPuntos > 0) setVentana({ inicio: 0, fin: totalPuntos - 1 });
    if (dominioYBase) setDominioY(dominioYBase);
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
          Rueda del ratón para acercar/alejar · arrastra (horizontal o vertical) para desplazarte
        </p>
        {!vistaCompleta && (
          <button type="button" className="precios-vivienda-reset-zoom" onClick={resetearZoom}>
            Ver todo el histórico
          </button>
        )}
      </div>

      <div
        ref={contenedorRef}
        className={`precios-vivienda-grafica${arrastrando ? ' precios-vivienda-grafica--arrastrando' : ''}`}
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
                tickFormatter={(v: number) => `${Math.round(v)}€`}
                domain={dominioY ?? ['auto', 'auto']}
                allowDataOverflow
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
