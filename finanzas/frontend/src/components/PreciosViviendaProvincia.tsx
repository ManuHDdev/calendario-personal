import { useEffect, useRef, useState } from 'react';
import {
  AreaSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { getProvincias, getPreciosVivienda, getEstadoImportacion, TOTAL_NACIONAL } from '../services/api';
import type { PrecioViviendaPunto, ImportacionEstado } from '../services/api';
import { formatearHace, trimestreATimestamp } from '../lib/preciosVivienda';
import { formatEUR } from '../lib/format';
import './PreciosViviendaProvincia.css';

function leerVariableCss(nombre: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

export default function PreciosViviendaProvincia() {
  const [provincias, setProvincias] = useState<string[]>([]);
  const [seleccion, setSeleccion] = useState<string>(TOTAL_NACIONAL);
  const [serie, setSerie] = useState<PrecioViviendaPunto[]>([]);
  const [estado, setEstado] = useState<ImportacionEstado | null>(null);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [cargandoSerie, setCargandoSerie] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

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

  // Crea el gráfico UNA sola vez (mismo patrón que EquityChart/PriceChart de
  // Trader: lightweight-charts, no Recharts — trae zoom con la rueda y
  // arrastre para desplazarse ya integrados, sin reinventarlos a mano).
  useEffect(() => {
    if (!contenedorRef.current) return;

    const colorTexto = leerVariableCss('--text-secondary');
    const colorBorde = leerVariableCss('--border');
    const colorAcento = leerVariableCss('--accent');

    const chart = createChart(contenedorRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: colorTexto,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: colorBorde },
        horzLines: { color: colorBorde },
      },
      rightPriceScale: { borderColor: colorBorde },
      timeScale: { borderColor: colorBorde, timeVisible: false },
      autoSize: true,
      localization: {
        priceFormatter: (v: number) => formatEUR(v),
      },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: colorAcento,
      topColor: `${colorAcento}33`,
      bottomColor: `${colorAcento}05`,
      lineWidth: 2,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // El toggle de tema claro/oscuro cambia `data-theme` en <html> — el
    // gráfico no se entera solo porque sus colores son valores fijos, no
    // variables CSS (pinta en un <canvas>), así que se reaplican a mano.
    const observador = new MutationObserver(() => {
      const texto = leerVariableCss('--text-secondary');
      const borde = leerVariableCss('--border');
      const acento = leerVariableCss('--accent');
      chart.applyOptions({
        layout: { textColor: texto },
        grid: { vertLines: { color: borde }, horzLines: { color: borde } },
        rightPriceScale: { borderColor: borde },
        timeScale: { borderColor: borde },
      });
      series.applyOptions({
        lineColor: acento,
        topColor: `${acento}33`,
        bottomColor: `${acento}05`,
      });
    });
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      observador.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Actualiza los datos pintados cuando cambia la serie cargada. Los
  // trimestres sin dato ("n.r" en el origen) se omiten en vez de
  // interpolarse — se ve como un hueco real en la línea.
  useEffect(() => {
    if (!seriesRef.current) return;
    const datos = serie
      .filter((p) => p.precio_m2 !== null)
      .map((p) => ({
        time: trimestreATimestamp(p.anio, p.trimestre) as UTCTimestamp,
        value: Number(p.precio_m2),
      }));
    seriesRef.current.setData(datos);
    chartRef.current?.timeScale().fitContent();
  }, [serie]);

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

      <p className="precios-vivienda-ayuda-zoom">
        Rueda del ratón para acercar/alejar · arrastra para desplazarte
      </p>

      <div className="precios-vivienda-grafica">
        {cargandoSerie && <p className="precios-vivienda-cargando precios-vivienda-cargando--flotante">Cargando…</p>}
        <div ref={contenedorRef} className="precios-vivienda-lienzo" />
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
