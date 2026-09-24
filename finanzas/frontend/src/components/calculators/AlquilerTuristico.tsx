import { useEffect, useRef, useState } from 'react';
import {
  AreaSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import {
  getCiudadesAlquilerTuristico,
  getBarriosAlquilerTuristico,
  getResumenAlquilerTuristico,
  getEstadoAlquilerTuristico,
} from '../../services/api';
import type { CiudadAirbnb, AlquilerTuristicoPunto, AlquilerTuristicoEstado } from '../../services/api';
import { fechaCapturaATimestamp, formatearHace } from '../../lib/preciosVivienda';
import { tieneSuficienteHistorico, formatearOcupacionEstimada, formatearPrecioNoche } from '../../lib/alquilerTuristico';
import './AlquilerTuristico.css';

function leerVariableCss(nombre: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

const TODOS_LOS_BARRIOS = '';

export default function AlquilerTuristico() {
  const [ciudades, setCiudades] = useState<CiudadAirbnb[]>([]);
  const [ciudadSeleccionada, setCiudadSeleccionada] = useState<string>('');
  const [barrios, setBarrios] = useState<string[]>([]);
  const [barrioSeleccionado, setBarrioSeleccionado] = useState<string>(TODOS_LOS_BARRIOS);

  const [puntos, setPuntos] = useState<AlquilerTuristicoPunto[]>([]);
  const [estado, setEstado] = useState<AlquilerTuristicoEstado | null>(null);

  const [cargandoCiudades, setCargandoCiudades] = useState(true);
  const [cargandoSerie, setCargandoSerie] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  // Carga la lista de ciudades con datos y el estado del importador una sola vez.
  useEffect(() => {
    let cancelado = false;
    Promise.all([getCiudadesAlquilerTuristico(), getEstadoAlquilerTuristico()])
      .then(([listaCiudades, estadoImportador]) => {
        if (cancelado) return;
        setCiudades(listaCiudades);
        setEstado(estadoImportador);
        if (listaCiudades.length > 0) setCiudadSeleccionada(listaCiudades[0].slug);
      })
      .catch((err: unknown) => {
        if (!cancelado) setError(err instanceof Error ? err.message : 'Error cargando datos');
      })
      .finally(() => {
        if (!cancelado) setCargandoCiudades(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Al cambiar de ciudad, recarga sus barrios y resetea el filtro de barrio.
  useEffect(() => {
    if (!ciudadSeleccionada) return;
    let cancelado = false;
    setBarrioSeleccionado(TODOS_LOS_BARRIOS);
    getBarriosAlquilerTuristico(ciudadSeleccionada)
      .then((lista) => {
        if (!cancelado) setBarrios(lista);
      })
      .catch((err: unknown) => {
        if (!cancelado) setError(err instanceof Error ? err.message : 'Error cargando barrios');
      });
    return () => {
      cancelado = true;
    };
  }, [ciudadSeleccionada]);

  // Recarga el resumen cuando cambia la ciudad o el barrio.
  useEffect(() => {
    if (!ciudadSeleccionada) return;
    let cancelado = false;
    setCargandoSerie(true);
    setError(null);

    getResumenAlquilerTuristico(ciudadSeleccionada, barrioSeleccionado || undefined)
      .then((resumen) => {
        if (!cancelado) setPuntos(resumen.puntos);
      })
      .catch((err: unknown) => {
        if (!cancelado) setError(err instanceof Error ? err.message : 'Error cargando el resumen');
      })
      .finally(() => {
        if (!cancelado) setCargandoSerie(false);
      });
    return () => {
      cancelado = true;
    };
  }, [ciudadSeleccionada, barrioSeleccionado]);

  // Mismo patrón que PreciosVivienda.tsx: lightweight-charts, colores
  // reactivos al tema vía MutationObserver sobre data-theme.
  useEffect(() => {
    if (!contenedorRef.current) return;

    const colorTexto = leerVariableCss('--text-secondary');
    const colorBorde = leerVariableCss('--border');
    const colorAcento = leerVariableCss('--accent');

    const chart = createChart(contenedorRef.current, {
      layout: { background: { color: 'transparent' }, textColor: colorTexto, fontSize: 11 },
      grid: { vertLines: { color: colorBorde }, horzLines: { color: colorBorde } },
      rightPriceScale: { borderColor: colorBorde },
      timeScale: { borderColor: colorBorde, timeVisible: false },
      autoSize: true,
      localization: { priceFormatter: (v: number) => `${v.toFixed(0)} €` },
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

  const suficienteHistorico = tieneSuficienteHistorico(puntos);

  useEffect(() => {
    if (!seriesRef.current || !suficienteHistorico) return;
    const datos = puntos
      .filter((p) => p.medianaPrecioNoche !== null)
      .map((p) => ({ time: fechaCapturaATimestamp(p.snapshotDate) as UTCTimestamp, value: p.medianaPrecioNoche as number }));
    seriesRef.current.setData(datos);
    chartRef.current?.timeScale().fitContent();
  }, [puntos, suficienteHistorico]);

  const ultimoPunto = [...puntos].reverse()[0];

  return (
    <div className="alquiler-turistico">
      <p className="alquiler-turistico-atribucion">
        Datos:{' '}
        <a href="https://insideairbnb.com" target="_blank" rel="noreferrer">
          Inside Airbnb
        </a>{' '}
        (insideairbnb.com), licencia CC BY 4.0.
      </p>

      <div className="alquiler-turistico-cabecera">
        <div className="calculator-select">
          <span>Ciudad</span>
          <select
            value={ciudadSeleccionada}
            onChange={(e) => setCiudadSeleccionada(e.target.value)}
            disabled={cargandoCiudades || ciudades.length === 0}
          >
            {ciudades.length === 0 && <option value="">Sin datos todavía</option>}
            {ciudades.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="calculator-select">
          <span>Barrio</span>
          <select
            value={barrioSeleccionado}
            onChange={(e) => setBarrioSeleccionado(e.target.value)}
            disabled={!ciudadSeleccionada}
          >
            <option value={TODOS_LOS_BARRIOS}>Toda la ciudad</option>
            {barrios.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {ultimoPunto && (
          <div className="alquiler-turistico-ultimo">
            <span className="alquiler-turistico-ultimo-valor">
              {formatearPrecioNoche(ultimoPunto.medianaPrecioNoche)}
            </span>
            <span className="alquiler-turistico-ultimo-detalle">
              ocupación estimada: {formatearOcupacionEstimada(ultimoPunto.ocupacionEstimadaPct)}
            </span>
            <span className="alquiler-turistico-ultimo-detalle">
              {ultimoPunto.numAnuncios} anuncios · snapshot {new Date(ultimoPunto.snapshotDate).toLocaleDateString('es-ES')}
            </span>
          </div>
        )}
      </div>

      {error && <div className="calculator-card-error">{error}</div>}

      {!cargandoSerie && puntos.length > 0 && !suficienteHistorico && (
        <div className="alquiler-turistico-aviso-historico">
          Aún no hay suficiente histórico para ver una tendencia (Inside Airbnb solo actualiza cada
          ciudad ~1 vez por trimestre) — vuelve dentro de unos meses.
        </div>
      )}

      {suficienteHistorico && (
        <>
          <p className="alquiler-turistico-ayuda-zoom">
            Rueda del ratón para acercar/alejar · arrastra para desplazarte
          </p>
          <div className="alquiler-turistico-grafica">
            {cargandoSerie && (
              <p className="alquiler-turistico-cargando alquiler-turistico-cargando--flotante">Cargando…</p>
            )}
            <div ref={contenedorRef} className="alquiler-turistico-lienzo" />
          </div>
        </>
      )}

      {ultimoPunto && ultimoPunto.porTipoHabitacion.length > 0 && (
        <div className="alquiler-turistico-desglose">
          <h3>Desglose por tipo de alojamiento (último snapshot)</h3>
          <table className="alquiler-turistico-tabla">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Mediana precio/noche</th>
                <th>Anuncios</th>
              </tr>
            </thead>
            <tbody>
              {ultimoPunto.porTipoHabitacion.map((t) => (
                <tr key={t.tipoHabitacion}>
                  <td>{t.tipoHabitacion}</td>
                  <td>{formatearPrecioNoche(t.medianaPrecioNoche)}</td>
                  <td>{t.numAnuncios}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="alquiler-turistico-nota">
        Precio y características de alquiler turístico (estilo Airbnb) — no confundir con
        precio_vivienda/precio_vivienda_capital, que son compra/alquiler de larga duración. La
        ocupación es una ESTIMACIÓN a partir de los días que el anuncio muestra como disponibles en
        el próximo año: un día bloqueado por el propietario cuenta igual que uno reservado, así que
        siempre sobreestima la ocupación real.{' '}
        {estado && (
          <>
            Última actualización: <strong>{formatearHace(estado.ultima_ejecucion)}</strong>
            {estado.ultima_ejecucion_ok === false && (
              <span className="alquiler-turistico-aviso-inline">
                {' '}
                (la última importación falló, mostrando el último dato disponible)
              </span>
            )}
          </>
        )}
      </p>
    </div>
  );
}
