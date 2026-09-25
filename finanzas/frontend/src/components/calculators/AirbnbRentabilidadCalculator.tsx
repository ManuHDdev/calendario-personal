import { useState, type FormEvent } from 'react';
import CalculatorCard from '../CalculatorCard';
import NumberField from '../NumberField';
import PatrimonioNetoChart from './PatrimonioNetoChart';
import {
  calcularAirbnbRentabilidad,
  simularProyeccionAirbnb,
  type AirbnbRentabilidadResultado,
  type ProyeccionAirbnbResultado,
} from '../../lib/calculators';
import { formatEUR } from '../../lib/format';

const CLASE_VEREDICTO: Record<AirbnbRentabilidadResultado['veredicto'], string> = {
  'Merece la pena': 'buena',
  Dudoso: 'dudosa',
  'No merece la pena': 'mala',
};

export default function AirbnbRentabilidadCalculator() {
  const [precioVivienda, setPrecioVivienda] = useState('150000');
  const [entradaPct, setEntradaPct] = useState('20');
  const [gastosCompraPct, setGastosCompraPct] = useState('10');
  const [tinHipotecaPct, setTinHipotecaPct] = useState('3');
  const [plazoHipotecaAnios, setPlazoHipotecaAnios] = useState('25');
  const [precioNocheMedio, setPrecioNocheMedio] = useState('80');
  const [ocupacionAnualPct, setOcupacionAnualPct] = useState('60');
  const [duracionMediaEstanciaNoches, setDuracionMediaEstanciaNoches] = useState('3');
  const [gastosLimpiezaPorEstancia, setGastosLimpiezaPorEstancia] = useState('40');
  const [comisionPlataformaPct, setComisionPlataformaPct] = useState('3');
  const [gestionPctIngresos, setGestionPctIngresos] = useState('0');
  const [suministrosMensuales, setSuministrosMensuales] = useState('100');
  const [ibiAnual, setIbiAnual] = useState('300');
  const [comunidadMensual, setComunidadMensual] = useState('40');
  const [seguroHogarAnual, setSeguroHogarAnual] = useState('150');
  const [mantenimientoPctAnual, setMantenimientoPctAnual] = useState('1.5');
  const [tasaTuristicaPorNoche, setTasaTuristicaPorNoche] = useState('0');
  const [licenciaTuristicaAnual, setLicenciaTuristicaAnual] = useState('0');
  const [amueblamientoInicial, setAmueblamientoInicial] = useState('6000');
  const [umbralRentabilidadAceptablePct, setUmbralRentabilidadAceptablePct] = useState('8');
  const [resultado, setResultado] = useState<AirbnbRentabilidadResultado | null>(null);
  const [proyeccion, setProyeccion] = useState<ProyeccionAirbnbResultado | null>(null);
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
        precioNocheMedio: Number(precioNocheMedio),
        ocupacionAnualPct: Number(ocupacionAnualPct),
        duracionMediaEstanciaNoches: Number(duracionMediaEstanciaNoches),
        gastosLimpiezaPorEstancia: Number(gastosLimpiezaPorEstancia),
        comisionPlataformaPct: Number(comisionPlataformaPct),
        gestionPctIngresos: Number(gestionPctIngresos),
        suministrosMensuales: suministrosMensuales ? Number(suministrosMensuales) : 0,
        ibiAnual: ibiAnual ? Number(ibiAnual) : 0,
        comunidadMensual: comunidadMensual ? Number(comunidadMensual) : 0,
        seguroHogarAnual: seguroHogarAnual ? Number(seguroHogarAnual) : 0,
        mantenimientoPctAnual: Number(mantenimientoPctAnual),
        tasaTuristicaPorNoche: tasaTuristicaPorNoche ? Number(tasaTuristicaPorNoche) : 0,
        licenciaTuristicaAnual: licenciaTuristicaAnual ? Number(licenciaTuristicaAnual) : 0,
        amueblamientoInicial: amueblamientoInicial ? Number(amueblamientoInicial) : 0,
        umbralRentabilidadAceptablePct: Number(umbralRentabilidadAceptablePct),
      };
      const r = calcularAirbnbRentabilidad(input);
      setResultado(r);
      setProyeccion(simularProyeccionAirbnb(input));
    } catch (err) {
      setResultado(null);
      setProyeccion(null);
      setError(err instanceof Error ? err.message : 'Datos inválidos');
    }
  };

  return (
    <CalculatorCard
      titulo="Invertir para Airbnb"
      descripcion="Rentabilidad de una vivienda como alquiler turístico de corta estancia: precio por noche × ocupación, en vez de un alquiler mensual fijo."
      ancho="amplio"
      onSubmit={handleSubmit}
      error={error}
      resultado={
        resultado && (
          <>
            <div className="resultado-linea">
              <span>Inversión inicial necesaria (incl. amueblamiento)</span>
              <strong>{formatEUR(resultado.inversionInicial)}</strong>
            </div>
            <div className="resultado-linea">
              <span>Noches ocupadas al año</span>
              <strong>{resultado.nochesOcupadasAnio.toFixed(0)}</strong>
            </div>
            <div className="resultado-linea">
              <span>Reservas al año (estimadas)</span>
              <strong>{resultado.numeroReservasAnio.toFixed(1)}</strong>
            </div>
            <div className="resultado-linea">
              <span>Ingreso bruto anual</span>
              <strong>{formatEUR(resultado.ingresoBrutoAnual)}</strong>
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

            <details className="calculator-desglose">
              <summary>Ver desglose de gastos anuales</summary>
              <div className="resultado-linea">
                <span>Limpieza (por estancia)</span>
                <strong>{formatEUR(resultado.gastosLimpiezaAnual)}</strong>
              </div>
              <div className="resultado-linea">
                <span>Comisión de la plataforma</span>
                <strong>{formatEUR(resultado.comisionPlataformaAnual)}</strong>
              </div>
              <div className="resultado-linea">
                <span>Gestión subcontratada</span>
                <strong>{formatEUR(resultado.gestionAnual)}</strong>
              </div>
              <div className="resultado-linea">
                <span>Suministros</span>
                <strong>{formatEUR(resultado.suministrosAnual)}</strong>
              </div>
              <div className="resultado-linea">
                <span>Tasa turística</span>
                <strong>{formatEUR(resultado.tasaTuristicaAnual)}</strong>
              </div>
              <div className="resultado-linea resultado-principal">
                <span>Total gastos operativos (incl. IBI, comunidad, seguro, mantenimiento)</span>
                <strong>{formatEUR(resultado.gastosOperativosAnuales)}</strong>
              </div>
            </details>

            <p className="calculator-help-text">
              Con apalancamiento usa el cashflow real tras hipoteca y todos los gastos (incluida la gestión del
              alquiler turístico). Sin apalancamiento es el ingreso bruto anual ya reflejando la ocupación, sobre
              el coste total de compra, sin restar ningún gasto ni cuota — útil para comparar el inmueble en sí.
            </p>
            <p className={`resultado-veredicto ${CLASE_VEREDICTO[resultado.veredicto]}`}>{resultado.veredicto}</p>
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
                  resultado final. Igual que en "Comprar para alquilar", este escenario mantiene precio por noche,
                  ocupación y gastos constantes durante toda la proyección — sin revalorización ni inflación.
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
      <p className="calculator-help-text">El precio de compra del inmueble que quieres destinar a alquiler turístico.</p>

      <NumberField label="Entrada" suffix="%" value={entradaPct} onChange={setEntradaPct} />
      <NumberField label="Gastos de compra" suffix="%" value={gastosCompraPct} onChange={setGastosCompraPct} />
      <NumberField label="TIN de la hipoteca" suffix="%" value={tinHipotecaPct} onChange={setTinHipotecaPct} />
      <NumberField label="Plazo de la hipoteca" suffix="años" value={plazoHipotecaAnios} onChange={setPlazoHipotecaAnios} />

      <NumberField label="Precio medio por noche (ADR)" suffix="€" value={precioNocheMedio} onChange={setPrecioNocheMedio} />
      <p className="calculator-help-text">
        Lo que cobrarías de media por noche. Puedes orientarte con la mediana real de tu zona en "Alquiler
        turístico (Airbnb)".
      </p>

      <NumberField label="Ocupación anual esperada" suffix="%" value={ocupacionAnualPct} onChange={setOcupacionAnualPct} />
      <p className="calculator-help-text">
        % de noches del año realmente ocupadas (reservadas), no solo "disponibles" — un anuncio bien gestionado
        en zona turística suele rondar el 50-70%.
      </p>

      <NumberField
        label="Duración media de la estancia"
        suffix="noches"
        value={duracionMediaEstanciaNoches}
        onChange={setDuracionMediaEstanciaNoches}
      />
      <p className="calculator-help-text">
        Se usa para estimar cuántas reservas hay al año (noches ocupadas ÷ duración media) y así calcular cuántas
        limpiezas/rotaciones de huésped hacen falta.
      </p>

      <NumberField
        label="Limpieza por estancia"
        suffix="€"
        value={gastosLimpiezaPorEstancia}
        onChange={setGastosLimpiezaPorEstancia}
      />
      <p className="calculator-help-text">Lo que cuesta la limpieza de cada reserva (no por noche, por estancia completa).</p>

      <NumberField
        label="Comisión de la plataforma"
        suffix="% del ingreso"
        value={comisionPlataformaPct}
        onChange={setComisionPlataformaPct}
      />
      <p className="calculator-help-text">Lo que se queda Airbnb/Booking sobre cada reserva. El 3% es el habitual del host en Airbnb.</p>

      <NumberField
        label="Gestión subcontratada (opcional)"
        suffix="% del ingreso"
        value={gestionPctIngresos}
        onChange={setGestionPctIngresos}
      />
      <p className="calculator-help-text">
        Si contratas una gestora de alquiler turístico (llaves, check-in, atención al huésped), su comisión suele
        rondar el 15-25% del ingreso. Déjalo a 0 si lo gestionas tú.
      </p>

      <NumberField
        label="Suministros mensuales"
        suffix="€"
        value={suministrosMensuales}
        onChange={setSuministrosMensuales}
        required={false}
      />
      <p className="calculator-help-text">
        Luz, agua, gas e internet — a diferencia de un alquiler de larga duración, en turístico normalmente los
        paga el propietario.
      </p>

      <NumberField label="IBI anual (opcional)" suffix="€" value={ibiAnual} onChange={setIbiAnual} required={false} />
      <NumberField
        label="Comunidad mensual (opcional)"
        suffix="€"
        value={comunidadMensual}
        onChange={setComunidadMensual}
        required={false}
      />
      <NumberField
        label="Seguro de hogar anual (opcional)"
        suffix="€"
        value={seguroHogarAnual}
        onChange={setSeguroHogarAnual}
        required={false}
      />

      <NumberField
        label="Mantenimiento/reparaciones"
        suffix="% del valor/año"
        value={mantenimientoPctAnual}
        onChange={setMantenimientoPctAnual}
      />
      <p className="calculator-help-text">
        Más alto que en alquiler de larga duración (aquí el 1% habitual): la rotación constante de huéspedes
        desgasta más el inmueble.
      </p>

      <NumberField
        label="Tasa turística por noche (opcional)"
        suffix="€/noche"
        value={tasaTuristicaPorNoche}
        onChange={setTasaTuristicaPorNoche}
        required={false}
      />
      <p className="calculator-help-text">
        Algunas comunidades autónomas y ayuntamientos (Cataluña, Baleares...) cobran una tasa turística por
        noche/huésped. Déjalo a 0 si no aplica en tu zona.
      </p>

      <NumberField
        label="Licencia turística anual (opcional)"
        suffix="€"
        value={licenciaTuristicaAnual}
        onChange={setLicenciaTuristicaAnual}
        required={false}
      />
      <p className="calculator-help-text">
        Coste de mantener la licencia de Vivienda de Uso Turístico (tasas, renovaciones, gestoría) — no confundir
        con la comisión de gestión de arriba.
      </p>

      <NumberField
        label="Amueblamiento inicial (opcional)"
        suffix="€"
        value={amueblamientoInicial}
        onChange={setAmueblamientoInicial}
        required={false}
      />
      <p className="calculator-help-text">
        Equipar el piso para alquiler turístico (muebles, electrodomésticos, menaje, ropa de cama). Es un coste
        ÚNICO que se suma a la inversión inicial, no a los gastos de cada año.
      </p>

      <NumberField
        label="Rentabilidad mínima aceptable"
        suffix="%"
        value={umbralRentabilidadAceptablePct}
        onChange={setUmbralRentabilidadAceptablePct}
      />
      <p className="calculator-help-text">
        Más alto que el de "Comprar para alquilar" (8% frente a 5%): un alquiler turístico exige más gestión,
        tiene más estacionalidad y más riesgo de regulación municipal, así que necesita más colchón de
        rentabilidad para compensar.
      </p>
    </CalculatorCard>
  );
}
