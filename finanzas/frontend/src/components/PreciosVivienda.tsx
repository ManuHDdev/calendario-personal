import { useEffect, useRef, useState } from 'react';
import {
  AreaSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import {
  getProvincias,
  getPreciosVivienda,
  getEstadoImportacion,
  getCapitales,
  getPreciosViviendaCapital,
  getEstadoScraperCapital,
  TOTAL_NACIONAL,
} from '../services/api';
import type { ImportacionEstado, CapitalScraperEstado } from '../services/api';
import { formatearHace, trimestreATimestamp, fechaCapturaATimestamp } from '../lib/preciosVivienda';
import { formatEUR } from '../lib/format';
import './PreciosVivienda.css';

type Fuente = 'oficial' | 'capital';

/** Un punto de la gráfica, ya reducido a lo que necesita el eje: tiempo + valor. */
interface PuntoGrafica {
  time: number;
  value: number;
  etiquetaPeriodo: string;
}

function leerVariableCss(nombre: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

export default function PreciosVivienda() {
  const [fuente, setFuente] = useState<Fuente>('oficial');

  const [provincias, setProvincias] = useState<string[]>([]);
  const [capitales, setCapitales] = useState<string[]>([]);
  const [seleccionProvincia, setSeleccionProvincia] = useState<string>(TOTAL_NACIONAL);
  const [seleccionCapital, setSeleccionCapital] = useState<string>('');

  const [puntos, setPuntos] = useState<PuntoGrafica[]>([]);
  const [estadoOficial, setEstadoOficial] = useState<ImportacionEstado | null>(null);
  const [estadoCapital, setEstadoCapital] = useState<CapitalScraperEstado | null>(null);

  const [cargandoLista, setCargandoLista] = useState(true);
  const [cargandoSerie, setCargandoSerie] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  // Carga las dos listas (provincias y capitales) y los dos estados una sola
  // vez: cambiar el toggle no repite estas peticiones, solo cambia qué serie
  // se pide y qué dropdown/nota se muestra.
  useEffect(() => {
    let cancelado = false;
    Promise.all([getProvincias(), getEstadoImportacion(), getCapitales(), getEstadoScraperCapital()])
      .then(([listaProvincias, estadoImportacion, listaCapitales, estadoScraper]) => {
        if (cancelado) return;
        setProvincias(listaProvincias);
        setEstadoOficial(estadoImportacion);
        setCapitales(listaCapitales);
        setEstadoCapital(estadoScraper);
        if (listaCapitales.length > 0) setSeleccionCapital(listaCapitales[0]);
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

  // Recarga la serie cuando cambia la fuente o la selección dentro de esa fuente.
  useEffect(() => {
    if (fuente === 'capital' && !seleccionCapital) return; // aún no hay lista de capitales cargada

    let cancelado = false;
    setCargandoSerie(true);
    setError(null);

    const promesa =
      fuente === 'oficial'
        ? getPreciosVivienda(seleccionProvincia).then((serie) =>
            serie
              .filter((p) => p.precio_m2 !== null)
              .map(
                (p): PuntoGrafica => ({
                  time: trimestreATimestamp(p.anio, p.trimestre),
                  value: Number(p.precio_m2),
                  etiquetaPeriodo: `T${p.trimestre} ${p.anio}`,
                }),
              ),
          )
        : getPreciosViviendaCapital(seleccionCapital).then((serie) =>
            serie
              .filter((p) => p.precio_m2 !== null)
              .map(
                (p): PuntoGrafica => ({
                  time: fechaCapturaATimestamp(p.fecha_captura),
                  value: Number(p.precio_m2),
                  etiquetaPeriodo: new Date(p.fecha_captura).toLocaleDateString('es-ES'),
                }),
              ),
          );

    promesa
      .then((serie) => {
        if (!cancelado) setPuntos(serie);
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
  }, [fuente, seleccionProvincia, seleccionCapital]);

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

  // Actualiza los datos pintados cuando cambia la serie cargada. Los puntos
  // sin dato ya se filtraron al construir `puntos`, así que aquí solo se pinta.
  useEffect(() => {
    if (!seriesRef.current) return;
    const datos = puntos.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
    seriesRef.current.setData(datos);
    chartRef.current?.timeScale().fitContent();
  }, [puntos]);

  const ultimoPunto = [...puntos].reverse()[0];

  return (
    <div className="precios-vivienda">
      <div className="precios-vivienda-toggle" role="tablist" aria-label="Fuente de datos">
        <button
          type="button"
          role="tab"
          aria-selected={fuente === 'oficial'}
          className={`precios-vivienda-toggle-btn${fuente === 'oficial' ? ' precios-vivienda-toggle-btn--activo' : ''}`}
          onClick={() => setFuente('oficial')}
        >
          Oficial (Ministerio, por provincia)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={fuente === 'capital'}
          className={`precios-vivienda-toggle-btn${fuente === 'capital' ? ' precios-vivienda-toggle-btn--activo' : ''}`}
          onClick={() => setFuente('capital')}
        >
          Anuncios (capital)
        </button>
      </div>

      <div className="precios-vivienda-cabecera">
        {fuente === 'oficial' ? (
          <div className="calculator-select">
            <span>Provincia / ámbito</span>
            <select
              value={seleccionProvincia}
              onChange={(e) => setSeleccionProvincia(e.target.value)}
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
        ) : (
          <div className="calculator-select">
            <span>Capital de provincia</span>
            <select
              value={seleccionCapital}
              onChange={(e) => setSeleccionCapital(e.target.value)}
              disabled={cargandoLista || capitales.length === 0}
            >
              {capitales.length === 0 && <option value="">Sin datos todavía</option>}
              {capitales.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}

        {ultimoPunto && (
          <div className="precios-vivienda-ultimo">
            <span className="precios-vivienda-ultimo-valor">{formatEUR(ultimoPunto.value)}/m²</span>
            <span className="precios-vivienda-ultimo-periodo">último dato: {ultimoPunto.etiquetaPeriodo}</span>
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

      {fuente === 'oficial' ? (
        <p className="precios-vivienda-nota">
          Fuente: Ministerio de Transportes y Movilidad Sostenible (valor tasado medio de vivienda
          libre, €/m²). No es un dato en directo — se actualiza periódicamente.{' '}
          {estadoOficial && (
            <>
              Última actualización: <strong>{formatearHace(estadoOficial.ultima_ejecucion)}</strong>
              {estadoOficial.ultima_ejecucion_ok === false && (
                <span className="precios-vivienda-aviso"> (la última importación falló, mostrando el último dato disponible)</span>
              )}
            </>
          )}
        </p>
      ) : (
        <p className="precios-vivienda-nota">
          Fuente: anuncios de Fotocasa y pisos.com, precio de OFERTA no de venta cerrada — no es un
          dato oficial.{' '}
          {estadoCapital && (
            <>
              Última actualización: <strong>{formatearHace(estadoCapital.ultima_ejecucion)}</strong>
              {estadoCapital.ultima_ejecucion_ok === false && (
                <span className="precios-vivienda-aviso"> (la última vuelta del scraper falló, mostrando el último dato disponible)</span>
              )}
            </>
          )}
        </p>
      )}
    </div>
  );
}
