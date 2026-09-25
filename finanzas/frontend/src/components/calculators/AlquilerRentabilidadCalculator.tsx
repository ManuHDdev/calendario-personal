import { useState, type FormEvent } from 'react';
import CalculatorCard from '../CalculatorCard';
import NumberField from '../NumberField';
import PatrimonioNetoChart from './PatrimonioNetoChart';
import {
  calcularAlquilerRentabilidad,
  simularProyeccionAlquiler,
  type AlquilerRentabilidadResultado,
  type ProyeccionAlquilerResultado,
} from '../../lib/calculators';
import { formatEUR } from '../../lib/format';

const CLASE_VEREDICTO: Record<AlquilerRentabilidadResultado['veredicto'], string> = {
  'Merece la pena': 'buena',
  Dudoso: 'dudosa',
  'No merece la pena': 'mala',
};

export default function AlquilerRentabilidadCalculator() {
  const [precioVivienda, setPrecioVivienda] = useState('150000');
  const [entradaPct, setEntradaPct] = useState('20');
  const [gastosCompraPct, setGastosCompraPct] = useState('10');
  const [tinHipotecaPct, setTinHipotecaPct] = useState('3');
  const [plazoHipotecaAnios, setPlazoHipotecaAnios] = useState('25');
  const [alquilerMensual, setAlquilerMensual] = useState('750');
  const [ibiAnual, setIbiAnual] = useState('300');
  const [comunidadMensual, setComunidadMensual] = useState('40');
  const [seguroHogarAnual, setSeguroHogarAnual] = useState('150');
  const [mantenimientoPctAnual, setMantenimientoPctAnual] = useState('1');
  const [gestoriaPctAlquiler, setGestoriaPctAlquiler] = useState('0');
  const [tasaVacioPct, setTasaVacioPct] = useState('5');
  const [umbralRentabilidadAceptablePct, setUmbralRentabilidadAceptablePct] = useState('5');
  const [resultado, setResultado] = useState<AlquilerRentabilidadResultado | null>(null);
  const [proyeccion, setProyeccion] = useState<ProyeccionAlquilerResultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      const input = {
        precioVivienda: Number(precioVivienda),
        entradaPct: Number(entradaPct),
        gastosCompraPct: Number(gastosCompraPct),
        tinHipotecaPct: Number(tinHipotecaPct),
        plazoHipotecaAnios: Number(plazoHipotecaAnios),
        alquilerMensual: Number(alquilerMensual),
        ibiAnual: ibiAnual ? Number(ibiAnual) : 0,
        comunidadMensual: comunidadMensual ? Number(comunidadMensual) : 0,
        seguroHogarAnual: seguroHogarAnual ? Number(seguroHogarAnual) : 0,
        mantenimientoPctAnual: Number(mantenimientoPctAnual),
        gestoriaPctAlquiler: Number(gestoriaPctAlquiler),
        tasaVacioPct: Number(tasaVacioPct),
        umbralRentabilidadAceptablePct: Number(umbralRentabilidadAceptablePct),
      };
      const r = calcularAlquilerRentabilidad(input);
      setResultado(r);
      setProyeccion(simularProyeccionAlquiler(input));
    } catch (err) {
      setResultado(null);
      setProyeccion(null);
      setError(err instanceof Error ? err.message : 'Datos inválidos');
    }
  };

  return (
    <CalculatorCard
      titulo="Comprar para alquilar"
      descripcion="Rentabilidad real de una vivienda como inversión: cash-on-cash return sobre lo que realmente pones de tu bolsillo."
      ancho="amplio"
      onSubmit={handleSubmit}
      error={error}
      resultado={
        resultado && (
          <>
            <div className="resultado-linea">
              <span>Inversión inicial necesaria</span>
              <strong>{formatEUR(resultado.inversionInicial)}</strong>
            </div>
            <div className="resultado-linea">
              <span>Cashflow mensual neto</span>
              <strong>{formatEUR(resultado.cashflowMensualNeto)}</strong>
            </div>
            <div className="resultado-linea">
              <span>Cashflow anual neto</span>
              <strong>{formatEUR(resultado.cashflowAnualNeto)}</strong>
            </div>
            <div className="resultado-linea">
              <span>Rentabilidad bruta anual</span>
              <strong>{resultado.rentabilidadBrutaAnualPct.toFixed(2)}%</strong>
            </div>
            <div className="resultado-linea resultado-principal">
              <span>Rentabilidad neta sobre inversión (cash-on-cash), anual</span>
              <strong>{resultado.rentabilidadNetaSobreInversionPct.toFixed(2)}%</strong>
            </div>
            <div className="resultado-linea">
              <span>ROI sin apalancamiento (como si pagaras al contado)</span>
              <strong>{resultado.roiSinApalancamientoPct.toFixed(2)}%</strong>
            </div>
            <p className="calculator-help-text">
              Con apalancamiento usa el cashflow real tras hipoteca y gastos, sobre lo que realmente pones de tu
              bolsillo. Sin apalancamiento es la renta anual efectiva sobre el coste total de compra, sin restar
              gastos ni cuota — útil para comparar el inmueble en sí, sin el efecto de cómo lo financies.
            </p>
            <p className={`resultado-veredicto ${CLASE_VEREDICTO[resultado.veredicto]}`}>
              {resultado.veredicto}
            </p>
            <p className="calculator-help-text">{resultado.mensaje}</p>

            {proyeccion && (
              <>
                <p className="calculator-help-text">
                  Cuando termines de pagar (año {plazoHipotecaAnios}), el cashflow anual sube a{' '}
                  {formatEUR(proyeccion.cashflowAnualTrasHipoteca)} (
                  {formatEUR(proyeccion.cashflowMensualTrasHipoteca)}/mes) — ya no hay cuota que pagar.
                </p>
                <div className="resultado-linea">
                  <span>Retorno total acumulado en {plazoHipotecaAnios} años (no es una tasa anual)</span>
                  <strong>{proyeccion.retornoTotalFinalSobreInversionPct.toFixed(2)}% sobre tu inversión inicial</strong>
                </div>
                <div className="resultado-linea resultado-principal">
                  <span>Ese mismo retorno, anualizado (comparable con la rentabilidad de arriba)</span>
                  <strong>{proyeccion.retornoTotalAnualizadoPct.toFixed(2)}% / año</strong>
                </div>
                <p className="calculator-help-text">
                  El retorno acumulado suma TODOS los años de la hipoteca de golpe (incluye el préstamo entero ya
                  amortizado, que suele ser varias veces tu inversión inicial), por eso sale un número mucho más
                  grande que la rentabilidad anual de arriba — no son la misma magnitud. La versión anualizada sí
                  lo es: es la tasa anual constante que, compuesta durante {plazoHipotecaAnios} años, da el mismo
                  resultado final.
                </p>

                <PatrimonioNetoChart datos={proyeccion.años} />

                <details className="calculator-desglose">
                  <summary>Ver proyección año a año hasta pagar la hipoteca</summary>
                  <div className="calculator-desglose-tabla-wrap">
                    <table className="calculator-desglose-tabla">
                      <thead>
                        <tr>
                          <th>Año</th>
                          <th>Cashflow del año</th>
                          <th>Capital amortizado</th>
                          <th>Patrimonio neto acumulado</th>
                          <th>Retorno total acumulado</th>
                          <th>Retorno sobre inversión</th>
                        </tr>
                      </thead>
                      <tbody>
                        {proyeccion.años.map((añoProyeccion) => (
                          <tr key={añoProyeccion.año}>
                            <td>{añoProyeccion.año}</td>
                            <td>{formatEUR(añoProyeccion.cashflowAnualNeto)}</td>
                            <td>{formatEUR(añoProyeccion.capitalAmortizadoAño)}</td>
                            <td>{formatEUR(añoProyeccion.patrimonioNetoAcumulado)}</td>
                            <td>{formatEUR(añoProyeccion.retornoTotalAcumulado)}</td>
                            <td>{añoProyeccion.retornoTotalSobreInversionPct.toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
          </>
        )
      }
    >
      <NumberField label="Precio de la vivienda" suffix="€" value={precioVivienda} onChange={setPrecioVivienda} />
      <p className="calculator-help-text">El precio de compra del inmueble que quieres alquilar.</p>

      <NumberField label="Entrada" suffix="%" value={entradaPct} onChange={setEntradaPct} />
      <p className="calculator-help-text">
        % del precio que pagas al contado (el banco financia el resto). A más entrada, menos hipoteca y menos
        cuota, pero también más dinero tuyo inmovilizado.
      </p>

      <NumberField label="Gastos de compra" suffix="%" value={gastosCompraPct} onChange={setGastosCompraPct} />
      <p className="calculator-help-text">
        Notaría, registro, impuestos de transmisión y gestoría de la compra. El 10% es una estimación habitual
        (mismo criterio que la calculadora "Ahorro necesario").
      </p>

      <NumberField label="TIN de la hipoteca" suffix="%" value={tinHipotecaPct} onChange={setTinHipotecaPct} />
      <p className="calculator-help-text">
        El interés que te cobra el banco por la parte financiada. Usa la calculadora "Hipoteca — TIN vs. TAE" si
        quieres afinar este número con comisiones y seguros incluidos.
      </p>

      <NumberField label="Plazo de la hipoteca" suffix="años" value={plazoHipotecaAnios} onChange={setPlazoHipotecaAnios} />
      <p className="calculator-help-text">Años para devolver la hipoteca de esta vivienda.</p>

      <NumberField label="Alquiler mensual esperado" suffix="€" value={alquilerMensual} onChange={setAlquilerMensual} />
      <p className="calculator-help-text">Lo que cobrarías de renta cada mes si la vivienda estuviera siempre alquilada.</p>

      <NumberField label="IBI anual (opcional)" suffix="€" value={ibiAnual} onChange={setIbiAnual} required={false} />
      <p className="calculator-help-text">El impuesto municipal sobre bienes inmuebles, lo paga el propietario cada año.</p>

      <NumberField
        label="Comunidad mensual (opcional)"
        suffix="€"
        value={comunidadMensual}
        onChange={setComunidadMensual}
        required={false}
      />
      <p className="calculator-help-text">La cuota mensual de la comunidad de vecinos, si el edificio la tiene.</p>

      <NumberField
        label="Seguro de hogar anual (opcional)"
        suffix="€"
        value={seguroHogarAnual}
        onChange={setSeguroHogarAnual}
        required={false}
      />
      <p className="calculator-help-text">El seguro del inmueble (no confundir con el seguro de vida vinculado a la hipoteca).</p>

      <NumberField
        label="Mantenimiento/reparaciones"
        suffix="% del valor/año"
        value={mantenimientoPctAnual}
        onChange={setMantenimientoPctAnual}
      />
      <p className="calculator-help-text">
        Lo que estimas gastar al año en arreglos y desgaste (grifería, pintura, electrodomésticos…). El 1% del
        valor de la vivienda es una regla habitual del sector.
      </p>

      <NumberField
        label="Gestoría de alquileres"
        suffix="% del alquiler"
        value={gestoriaPctAlquiler}
        onChange={setGestoriaPctAlquiler}
      />
      <p className="calculator-help-text">
        Si contratas a una agencia para que gestione el alquiler (buscar inquilino, cobros, incidencias), su
        comisión suele ser un % de la renta. Déjalo a 0 si lo gestionas tú mismo.
      </p>

      <NumberField label="Tasa de vacío esperada" suffix="%" value={tasaVacioPct} onChange={setTasaVacioPct} />
      <p className="calculator-help-text">
        % del año que esperas que la vivienda esté vacía entre inquilinos (buscando uno nuevo, reformando…). El
        5% equivale a, aproximadamente, medio mes sin alquilar al año.
      </p>

      <NumberField
        label="Rentabilidad mínima aceptable"
        suffix="%"
        value={umbralRentabilidadAceptablePct}
        onChange={setUmbralRentabilidadAceptablePct}
      />
      <p className="calculator-help-text">
        El listón que tú decides: por debajo de este % de rentabilidad sobre lo que pones de tu bolsillo, la
        calculadora marcará la inversión como "Dudosa" aunque tenga cashflow positivo.
      </p>
    </CalculatorCard>
  );
}
