import { useEffect, useRef } from 'react';
import {
  AreaSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { formatEUR } from '../../lib/format';
import './PatrimonioNetoChart.css';

export interface PuntoPatrimonio {
  año: number;
  patrimonioNetoAcumulado: number;
}

/**
 * Gráfica de "cómo crece el patrimonio" a lo largo de la proyección de una
 * inversión inmobiliaria (Comprar para alquilar, Invertir para Airbnb):
 * mismo `lightweight-charts` que ya usa el resto de finanzas
 * (`PreciosVivienda.tsx`, `AlquilerTuristico.tsx`), pero el eje de tiempo no
 * son fechas reales — son años relativos a hoy (1, 2, 3…), así que se
 * codifican como timestamps ficticios (año 2000 + N) únicamente para tener
 * una escala de tiempo creciente, y se sobreescribe tanto el formato de los
 * ticks del eje como el del crosshair para que SIEMPRE se lea "Año N", nunca
 * la fecha ficticia subyacente — mostrar "2003" confundiría al usuario
 * pensando que es un año calendario real.
 */
function leerVariableCss(nombre: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

const AÑO_BASE_FICTICIO = 2000;

function añoATimestamp(año: number): UTCTimestamp {
  return (Date.UTC(AÑO_BASE_FICTICIO + año, 0, 1) / 1000) as UTCTimestamp;
}

function timestampAEtiquetaAño(time: number): string {
  const año = new Date(time * 1000).getUTCFullYear() - AÑO_BASE_FICTICIO;
  return `Año ${año}`;
}

export default function PatrimonioNetoChart({ datos }: { datos: PuntoPatrimonio[] }) {
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
    const puntos = datos.map((p) => ({ time: añoATimestamp(p.año), value: p.patrimonioNetoAcumulado }));
    seriesRef.current.setData(puntos);
    chartRef.current?.timeScale().fitContent();
  }, [datos]);

  return (
    <div className="patrimonio-neto-chart">
      <p className="patrimonio-neto-chart-ayuda">
        Cómo crece tu patrimonio neto en la vivienda (precio de compra menos hipoteca pendiente) a lo largo de
        los años — rueda del ratón para acercar/alejar, arrastra para desplazarte.
      </p>
      <div ref={contenedorRef} className="patrimonio-neto-chart-lienzo" />
    </div>
  );
}
