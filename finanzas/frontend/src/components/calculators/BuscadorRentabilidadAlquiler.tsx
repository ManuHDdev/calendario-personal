import { useMemo, useState, type FormEvent } from 'react';
import CalculatorCard from '../CalculatorCard';
import NumberField from '../NumberField';
import RentabilidadZonaMapa from './RentabilidadZonaMapa';
import { getRentabilidadZona } from '../../services/api';
import type { RentabilidadZonaListing, RentabilidadZonaResultado } from '../../services/api';
import {
  calcularRankingRentabilidad,
  formatearDesviacionVenta,
  type ParametrosFinanciacion,
} from '../../lib/rentabilidadZona';
import { formatEUR } from '../../lib/format';
import './BuscadorRentabilidadAlquiler.css';

const CLASE_VEREDICTO: Record<string, string> = {
  'Merece la pena': 'buena',
  Dudoso: 'dudosa',
  'No merece la pena': 'mala',
};

// Mismos valores por defecto que "Comprar para alquilar"
// (AlquilerRentabilidadCalculator), para que el punto de partida sea
// coherente entre las dos calculadoras.
const PARAMETROS_INICIALES = {
  entradaPct: '20',
  gastosCompraPct: '10',
  tinHipotecaPct: '3',
  plazoHipotecaAnios: '25',
  ibiAnual: '300',
  comunidadMensual: '40',
  seguroHogarAnual: '150',
  mantenimientoPctAnual: '1',
  gestoriaPctAlquiler: '0',
  tasaVacioPct: '5',
  umbralRentabilidadAceptablePct: '5',
};

export default function BuscadorRentabilidadAlquiler() {
  const [ubicacion, setUbicacion] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RentabilidadZonaResultado | null>(null);

  const [params, setParams] = useState(PARAMETROS_INICIALES);

  // Selección compartida entre mapa y lista: se guarda por `url` (clave
  // estable, la misma que ya se usa como `key` de React), no el objeto
  // listing en sí — así la selección sobrevive a un re-rankeo (editar TIN,
  // gastos de reforma…) que crea listings nuevos en cada render.
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  // "Y si reformo ESTE piso": ajuste per-listing, puramente client-side,
  // nunca enviado al backend ni mezclado con los parámetros globales de
  // financiación. Clave = listing.url, valor = string tal y como se edita
  // (permite dejar el campo vacío mientras se escribe, igual que el resto
  // de NumberField del formulario).
  const [gastosReformaInputs, setGastosReformaInputs] = useState<Record<string, string>>({});

  const handleBuscar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const texto = ubicacion.trim();
    if (!texto) return;

    setError(null);
    setBuscando(true);
    getRentabilidadZona(texto)
      .then((r) => {
        setResultado(r);
        // Resultados nuevos → ni la selección ni los gastos de reforma de la
        // búsqueda anterior tienen sentido (son de otros listings).
        setSelectedUrl(null);
        setGastosReformaInputs({});
      })
      .catch((err: unknown) => {
        setResultado(null);
        setError(err instanceof Error ? err.message : 'Error buscando la zona');
      })
      .finally(() => setBuscando(false));
  };

  // Los parámetros de financiación se parsean a número cada vez que cambian
  // (nunca en el submit: no hay submit, el ranking se recalcula al instante,
  // sin ninguna petición de red nueva).
  const parametrosFinanciacion: ParametrosFinanciacion | null = useMemo(() => {
    const n = (v: string) => Number(v);
    const valores = {
      entradaPct: n(params.entradaPct),
      gastosCompraPct: n(params.gastosCompraPct),
      tinHipotecaPct: n(params.tinHipotecaPct),
      plazoHipotecaAnios: n(params.plazoHipotecaAnios),
      ibiAnual: n(params.ibiAnual),
      comunidadMensual: n(params.comunidadMensual),
      seguroHogarAnual: n(params.seguroHogarAnual),
      mantenimientoPctAnual: n(params.mantenimientoPctAnual),
      gestoriaPctAlquiler: n(params.gestoriaPctAlquiler),
      tasaVacioPct: n(params.tasaVacioPct),
      umbralRentabilidadAceptablePct: n(params.umbralRentabilidadAceptablePct),
    };
    if (Object.values(valores).some((v) => !Number.isFinite(v) || v < 0)) return null;
    if (valores.plazoHipotecaAnios <= 0) return null;
    return valores;
  }, [params]);

  // Del string editable al mapa numérico que espera calcularRankingRentabilidad:
  // vacío o inválido → sin entrada (0, "no toques el precio de este listing").
  const gastosReformaPorListing = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [url, raw] of Object.entries(gastosReformaInputs)) {
      if (raw.trim() === '') continue;
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) out[url] = n;
    }
    return out;
  }, [gastosReformaInputs]);

  const ranking = useMemo(() => {
    if (!resultado || !parametrosFinanciacion) return [];
    return calcularRankingRentabilidad(resultado.listings, parametrosFinanciacion, gastosReformaPorListing);
  }, [resultado, parametrosFinanciacion, gastosReformaPorListing]);

  const selectedItem = useMemo(
    () => ranking.find((r) => r.listing.url === selectedUrl) ?? null,
    [ranking, selectedUrl],
  );
  const selectedListing: RentabilidadZonaListing | null = selectedItem?.listing ?? null;

  const setParam = (campo: keyof typeof PARAMETROS_INICIALES) => (valor: string) =>
    setParams((prev) => ({ ...prev, [campo]: valor }));

  const setGastosReforma = (url: string) => (valor: string) =>
    setGastosReformaInputs((prev) => ({ ...prev, [url]: valor }));

  const seleccionar = (listing: RentabilidadZonaListing) => setSelectedUrl(listing.url);

  return (
    <div className="rentabilidad-zona">
      <CalculatorCard
        titulo="Rentabilidad de alquiler por zona"
        descripcion="Busca anuncios en venta de una zona y estima cuánto se alquilaría cada uno, a partir del precio/m² real de alquiler de esa misma zona."
        onSubmit={handleBuscar}
        error={error}
      >
        <label className="number-field">
          <span className="number-field-label">Ubicación</span>
          <div className="number-field-input-wrap">
            <input
              type="text"
              placeholder="Cáceres, Badajoz…"
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value)}
              required
            />
          </div>
        </label>
        <p className="calculator-help-text">
          Nombre de ciudad o zona, igual que en "Precios de vivienda por provincia". La búsqueda rastrea
          Fotocasa y pisos.com en directo — puede tardar unos segundos.
        </p>
      </CalculatorCard>

      {buscando && <p className="rentabilidad-zona-cargando">Buscando anuncios en venta y en alquiler…</p>}

      {resultado && (
        <div className="rentabilidad-zona-resultado">
          {resultado.avisos.length > 0 && (
            <div className="calculator-card-error rentabilidad-zona-avisos">
              {resultado.avisos.map((aviso) => (
                <p key={aviso}>{aviso}</p>
              ))}
            </div>
          )}

          <div className="calculator-card rentabilidad-zona-parametros">
            <h2 className="calculator-card-titulo">Parámetros de financiación</h2>
            <p className="calculator-card-descripcion">
              Los mismos que "Comprar para alquilar". Cámbialos y el ranking de abajo se recalcula al
              instante, sin volver a buscar.
            </p>
            <div className="calculator-card-campos rentabilidad-zona-campos-grid">
              <NumberField label="Entrada" suffix="%" value={params.entradaPct} onChange={setParam('entradaPct')} />
              <NumberField
                label="Gastos de compra"
                suffix="%"
                value={params.gastosCompraPct}
                onChange={setParam('gastosCompraPct')}
              />
              <NumberField
                label="TIN de la hipoteca"
                suffix="%"
                value={params.tinHipotecaPct}
                onChange={setParam('tinHipotecaPct')}
              />
              <NumberField
                label="Plazo de la hipoteca"
                suffix="años"
                value={params.plazoHipotecaAnios}
                onChange={setParam('plazoHipotecaAnios')}
              />
              <NumberField label="IBI anual" suffix="€" value={params.ibiAnual} onChange={setParam('ibiAnual')} />
              <NumberField
                label="Comunidad mensual"
                suffix="€"
                value={params.comunidadMensual}
                onChange={setParam('comunidadMensual')}
              />
              <NumberField
                label="Seguro de hogar anual"
                suffix="€"
                value={params.seguroHogarAnual}
                onChange={setParam('seguroHogarAnual')}
              />
              <NumberField
                label="Mantenimiento"
                suffix="% del valor/año"
                value={params.mantenimientoPctAnual}
                onChange={setParam('mantenimientoPctAnual')}
              />
              <NumberField
                label="Gestoría de alquileres"
                suffix="% del alquiler"
                value={params.gestoriaPctAlquiler}
                onChange={setParam('gestoriaPctAlquiler')}
              />
              <NumberField
                label="Tasa de vacío esperada"
                suffix="%"
                value={params.tasaVacioPct}
                onChange={setParam('tasaVacioPct')}
              />
              <NumberField
                label="Rentabilidad mínima aceptable"
                suffix="%"
                value={params.umbralRentabilidadAceptablePct}
                onChange={setParam('umbralRentabilidadAceptablePct')}
              />
            </div>
            {!parametrosFinanciacion && (
              <p className="calculator-card-error">Revisa los parámetros de financiación: alguno no es válido.</p>
            )}
          </div>

          {(resultado.medianaVentaM2 !== null || resultado.medianaAlquilerM2 !== null) && (
            <div className="rentabilidad-zona-resumen">
              {resultado.medianaVentaM2 !== null && (
                <span>
                  Mediana de venta: <strong>{formatEUR(resultado.medianaVentaM2)}/m²</strong>{' '}
                  <span className="rentabilidad-zona-comparables">
                    ({resultado.numComparablesVentaTotal} comparable{resultado.numComparablesVentaTotal === 1 ? '' : 's'})
                  </span>
                </span>
              )}
              {resultado.medianaAlquilerM2 !== null && (
                <span>
                  Mediana de alquiler: <strong>{formatEUR(resultado.medianaAlquilerM2)}/m²/mes</strong>{' '}
                  <span className="rentabilidad-zona-comparables">
                    ({resultado.numComparablesAlquilerTotal} comparable{resultado.numComparablesAlquilerTotal === 1 ? '' : 's'})
                  </span>
                </span>
              )}
            </div>
          )}

          {ranking.length === 0 && !buscando ? (
            <p className="rentabilidad-zona-vacio">Sin anuncios en venta para "{resultado.ubicacion}".</p>
          ) : (
            <>
              <div className="rentabilidad-zona-mapa-layout">
                <RentabilidadZonaMapa listings={ranking} selectedListing={selectedListing} onSelect={seleccionar} />

                <div className="rentabilidad-zona-detalle">
                  {!selectedListing ? (
                    <p className="rentabilidad-zona-detalle-vacio">
                      Selecciona un piso en el mapa o en la lista para ver sus fotos y detalles.
                    </p>
                  ) : (
                    <>
                      {selectedListing.imagenUrl && (
                        <img
                          className="rentabilidad-zona-detalle-imagen"
                          src={selectedListing.imagenUrl}
                          alt=""
                          loading="lazy"
                        />
                      )}
                      <div className="rentabilidad-zona-titulo-linea">
                        <span className="rentabilidad-zona-detalle-titulo">{selectedListing.titulo}</span>
                        <span className="rentabilidad-zona-portal">{selectedListing.portal}</span>
                      </div>
                      <span className="rentabilidad-zona-ubicacion">{selectedListing.ubicacion ?? '—'}</span>

                      <div className="rentabilidad-zona-detalle-datos">
                        <span>{formatEUR(selectedListing.precio)}</span>
                        <span>{selectedListing.metros} m²</span>
                        {selectedListing.habitaciones !== null && <span>{selectedListing.habitaciones} hab.</span>}
                      </div>

                      {selectedListing.desviacionVsMedianaVentaPct !== null && (
                        <span
                          className={`rentabilidad-zona-desviacion ${
                            selectedListing.desviacionVsMedianaVentaPct <= 0 ? 'favorable' : 'desfavorable'
                          }`}
                        >
                          {formatearDesviacionVenta(selectedListing.desviacionVsMedianaVentaPct)}
                        </span>
                      )}

                      <div className="rentabilidad-zona-alquiler">
                        {selectedListing.alquilerMensualEstimado === null ? (
                          <span className="rentabilidad-zona-sin-datos">sin datos suficientes de alquiler</span>
                        ) : (
                          <>
                            <span>Alquiler estimado: {formatEUR(selectedListing.alquilerMensualEstimado)}/mes</span>
                            <span className="rentabilidad-zona-comparables">
                              ({selectedListing.numComparablesAlquiler} comparable
                              {selectedListing.numComparablesAlquiler === 1 ? '' : 's'})
                            </span>
                            {selectedListing.confianza === 'baja' && (
                              <span className="rentabilidad-zona-baja-confianza">confianza baja</span>
                            )}
                          </>
                        )}
                      </div>

                      <div className="rentabilidad-zona-detalle-reforma">
                        <NumberField
                          label="Gastos de reforma (€)"
                          value={gastosReformaInputs[selectedListing.url] ?? ''}
                          onChange={setGastosReforma(selectedListing.url)}
                          placeholder="0"
                          required={false}
                        />
                        <p className="calculator-help-text">
                          Se suma al precio solo para calcular la rentabilidad de ESTE piso — no es una
                          hipótesis global, ni se envía al buscar.
                        </p>
                      </div>

                      <div className="rentabilidad-zona-detalle-rentabilidad">
                        {selectedItem?.resultado ? (
                          <>
                            <div className="rentabilidad-zona-detalle-roi-linea">
                              <span>Con apalancamiento (cash-on-cash)</span>
                              <span className="rentabilidad-zona-rentabilidad-pct">
                                {selectedItem.resultado.rentabilidadNetaSobreInversionPct.toFixed(2)}%
                              </span>
                            </div>
                            <div className="rentabilidad-zona-detalle-roi-linea">
                              <span>Sin apalancamiento (al contado)</span>
                              <span className="rentabilidad-zona-rentabilidad-pct rentabilidad-zona-rentabilidad-pct--secundaria">
                                {selectedItem.resultado.roiSinApalancamientoPct.toFixed(2)}%
                              </span>
                            </div>
                            <span
                              className={`resultado-veredicto ${CLASE_VEREDICTO[selectedItem.resultado.veredicto]}`}
                            >
                              {selectedItem.resultado.veredicto}
                            </span>
                          </>
                        ) : (
                          <span className="rentabilidad-zona-sin-datos">Sin datos suficientes para calcular la rentabilidad.</span>
                        )}
                      </div>

                      <a
                        className="rentabilidad-zona-detalle-enlace"
                        href={selectedListing.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver anuncio original ↗
                      </a>
                    </>
                  )}
                </div>
              </div>

              <div className="rentabilidad-zona-listado">
                {ranking.map(({ listing, resultado: r }) => {
                  const seleccionado = listing.url === selectedUrl;
                  const sinMapa = listing.latitud === null || listing.longitud === null;
                  return (
                    <div
                      key={listing.url}
                      className={`rentabilidad-zona-fila${seleccionado ? ' seleccionada' : ''}`}
                      onClick={() => seleccionar(listing)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') seleccionar(listing);
                      }}
                    >
                      {listing.imagenUrl && (
                        <img className="rentabilidad-zona-imagen" src={listing.imagenUrl} alt="" loading="lazy" />
                      )}
                      <div className="rentabilidad-zona-info">
                        <div className="rentabilidad-zona-titulo-linea">
                          <span className="rentabilidad-zona-titulo">{listing.titulo}</span>
                          <span className="rentabilidad-zona-portal">{listing.portal}</span>
                          {sinMapa && <span className="rentabilidad-zona-sin-mapa">sin ubicación en el mapa</span>}
                        </div>
                        <span className="rentabilidad-zona-ubicacion">{listing.ubicacion ?? '—'}</span>
                        <div className="rentabilidad-zona-datos">
                          <span>{formatEUR(listing.precio)}</span>
                          <span>{listing.metros} m²</span>
                          {listing.habitaciones !== null && <span>{listing.habitaciones} hab.</span>}
                          {listing.desviacionVsMedianaVentaPct !== null && (
                            <span
                              className={`rentabilidad-zona-desviacion ${
                                listing.desviacionVsMedianaVentaPct <= 0 ? 'favorable' : 'desfavorable'
                              }`}
                            >
                              {formatearDesviacionVenta(listing.desviacionVsMedianaVentaPct)}
                            </span>
                          )}
                        </div>
                        <div className="rentabilidad-zona-alquiler">
                          {listing.alquilerMensualEstimado === null ? (
                            <span className="rentabilidad-zona-sin-datos">sin datos suficientes de alquiler</span>
                          ) : (
                            <>
                              <span>Alquiler estimado: {formatEUR(listing.alquilerMensualEstimado)}/mes</span>
                              <span className="rentabilidad-zona-comparables">
                                ({listing.numComparablesAlquiler} comparable
                                {listing.numComparablesAlquiler === 1 ? '' : 's'})
                              </span>
                              {listing.confianza === 'baja' && (
                                <span className="rentabilidad-zona-baja-confianza">confianza baja</span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="rentabilidad-zona-rentabilidad">
                        {r ? (
                          <>
                            <span className="rentabilidad-zona-rentabilidad-pct">
                              {r.rentabilidadNetaSobreInversionPct.toFixed(2)}%
                            </span>
                            <span className={`resultado-veredicto ${CLASE_VEREDICTO[r.veredicto]}`}>{r.veredicto}</span>
                          </>
                        ) : (
                          <span className="rentabilidad-zona-sin-datos">—</span>
                        )}
                        <a
                          className="rentabilidad-zona-fila-abrir"
                          href={listing.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          abrir anuncio ↗
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
