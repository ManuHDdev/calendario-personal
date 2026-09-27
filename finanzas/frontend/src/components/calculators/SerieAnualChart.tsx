import { useEffect, useRef } from 'react';
import {
  AreaSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { formatEUR } from '../../lib/format';
import './SerieAnualChart.css';

export interface PuntoSerieAnual {
  /** Años transcurridos desde el inicio — normalmente entero, pero admite fracciones (p. ej. 10.5). */
  año: number;
  valor: number;
}

/**
 * Gráfica genérica de "cómo evoluciona una cifra a lo largo de los años" —
 * usada tanto por las calculadoras de rentabilidad inmobiliaria (patrimonio
 * neto acumulado) como por "Interés compuesto" (capital/saldo acumulado):
 * mismo `lightweight-charts` que ya usa el resto de finanzas
 * (`PreciosVivienda.tsx`, `AlquilerTuristico.tsx`).
 *
 * El eje de tiempo no son fechas reales — son años relativos al inicio de la
 * simulación (1, 2, 3…, con soporte para un punto final fraccionario si el
 * plazo no es un número entero de años) — así que se codifican como
 * timestamps ficticios (una época base arbitraria + N días por año) solo
 * para tener una escala de tiempo creciente, y se sobreescribe tanto el
 * formato de los ticks del eje como el del crosshair para que SIEMPRE se lea
 * "Año N", nunca la fecha ficticia subyacente.
 */
function leerVariableCss(nombre: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

const EPOCA_BASE_MS = Date.UTC(2000, 0, 1);
const MS_POR_DIA = 86_400_000;
const DIAS_POR_AÑO = 365;

function añoATimestamp(año: number): UTCTimestamp {
  return ((EPOCA_BASE_MS + año * DIAS_POR_AÑO * MS_POR_DIA) / 1000) as UTCTimestamp;
}

function timestampAAño(time: number): number {
  return (time * 1000 - EPOCA_BASE_MS) / (DIAS_POR_AÑO * MS_POR_DIA);
}

function timestampAEtiquetaAño(time: number): string {
  const año = Math.round(timestampAAño(time) * 100) / 100;
  return `Año ${Number.isInteger(año) ? año : año.toFixed(2)}`;
}

export default function SerieAnualChart({ datos, ayuda }: { datos: PuntoSerieAnual[]; ayuda: string }) {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  useEffect(() => {
    if (!contenedorRef.current) return;

    const colorTexto = leerVariableCss('--text-secondary');
    const colorBorde = leerVariableCss('--border');
    const colorAcento = leerVariableCss('--accent');

    const chart = createChart(contenedorRef.current, {
      layout: { background: { color: 'transparent' }, textColor: colorTexto, fontSize: 11 },
      grid: { vertLines: { color: colorBorde }, horzLines: { color: colorBorde } },
      rightPriceScale: { borderColor: colorBorde },
      timeScale: {
        borderColor: colorBorde,
        timeVisible: false,
        tickMarkFormatter: timestampAEtiquetaAño,
      },
      autoSize: true,
      localization: {
        priceFormatter: (v: number) => formatEUR(v),
        timeFormatter: timestampAEtiquetaAño,
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
      series.applyOptions({ lineColor: acento, topColor: `${acento}33`, bottomColor: `${acento}05` });
    });
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      observador.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;
    const puntos = datos.map((p) => ({ time: añoATimestamp(p.año), value: p.valor }));
    seriesRef.current.setData(puntos);
    chartRef.current?.timeScale().fitContent();
  }, [datos]);

  return (
    <div className="serie-anual-chart">
      <p className="serie-anual-chart-ayuda">{ayuda}</p>
      <div ref={contenedorRef} className="serie-anual-chart-lienzo" />
    </div>
  );
}
