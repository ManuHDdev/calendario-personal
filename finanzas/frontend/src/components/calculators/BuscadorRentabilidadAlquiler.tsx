import { useMemo, useState, type FormEvent } from 'react';
import CalculatorCard from '../CalculatorCard';
import NumberField from '../NumberField';
import { getRentabilidadZona } from '../../services/api';
import type { RentabilidadZonaResultado } from '../../services/api';
import { calcularRankingRentabilidad, type ParametrosFinanciacion } from '../../lib/rentabilidadZona';
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

  const handleBuscar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const texto = ubicacion.trim();
    if (!texto) return;

    setError(null);
    setBuscando(true);
    getRentabilidadZona(texto)
      .then((r) => setResultado(r))
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

  const ranking = useMemo(() => {
    if (!resultado || !parametrosFinanciacion) return [];
    return calcularRankingRentabilidad(resultado.listings, parametrosFinanciacion);
  }, [resultado, parametrosFinanciacion]);

  const setParam = (campo: keyof typeof PARAMETROS_INICIALES) => (valor: string) =>
    setParams((prev) => ({ ...prev, [campo]: valor }));

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

          <div className="rentabilidad-zona-listado">
            {ranking.length === 0 && !buscando && (
              <p className="rentabilidad-zona-vacio">Sin anuncios en venta para "{resultado.ubicacion}".</p>
            )}
            {ranking.map(({ listing, resultado: r }) => (
              <a
                key={listing.url}
                href={listing.url}
                target="_blank"
                rel="noreferrer"
                className="rentabilidad-zona-fila"
              >
                {listing.imagenUrl && (
                  <img className="rentabilidad-zona-imagen" src={listing.imagenUrl} alt="" loading="lazy" />
                )}
                <div className="rentabilidad-zona-info">
                  <div className="rentabilidad-zona-titulo-linea">
                    <span className="rentabilidad-zona-titulo">{listing.titulo}</span>
                    <span className="rentabilidad-zona-portal">{listing.portal}</span>
                  </div>
                  <span className="rentabilidad-zona-ubicacion">{listing.ubicacion ?? '—'}</span>
                  <div className="rentabilidad-zona-datos">
                    <span>{formatEUR(listing.precio)}</span>
                    <span>{listing.metros} m²</span>
                    {listing.habitaciones !== null && <span>{listing.habitaciones} hab.</span>}
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
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
