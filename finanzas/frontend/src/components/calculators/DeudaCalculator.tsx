import { useState, type FormEvent } from 'react';
import CalculatorCard from '../CalculatorCard';
import NumberField from '../NumberField';
import { calcularDeuda, type DeudaResultado } from '../../lib/calculators';
import { formatEUR } from '../../lib/format';

type ModoBeneficio = 'total' | 'mensual';

export default function DeudaCalculator() {
  const [capital, setCapital] = useState('5000');
  const [tasaAnual, setTasaAnual] = useState('6');
  const [plazoAnios, setPlazoAnios] = useState('4');
  const [beneficioEsperado, setBeneficioEsperado] = useState('');
  const [modoBeneficio, setModoBeneficio] = useState<ModoBeneficio>('total');
  const [resultado, setResultado] = useState<DeudaResultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Si el beneficio es mensual, la conversión a total del periodo (× plazo en
  // meses) se hace aquí, en el componente — calcularDeuda sigue recibiendo
  // siempre el total, sin cambiar su firma.
  const plazoAniosNum = Number(plazoAnios);
  const beneficioTotalEquivalente =
    modoBeneficio === 'mensual' && beneficioEsperado && Number.isFinite(plazoAniosNum) && plazoAniosNum > 0
      ? Number(beneficioEsperado) * plazoAniosNum * 12
      : null;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      const beneficioTotal = beneficioEsperado
        ? modoBeneficio === 'mensual'
          ? Number(beneficioEsperado) * Number(plazoAnios) * 12
          : Number(beneficioEsperado)
        : undefined;

      const r = calcularDeuda({
        capital: Number(capital),
        tasaAnualPct: Number(tasaAnual),
        plazoAnios: Number(plazoAnios),
        beneficioEsperado: beneficioTotal,
      });
      setResultado(r);
    } catch (err) {
      setResultado(null);
      setError(err instanceof Error ? err.message : 'Datos inválidos');
    }
  };

  return (
    <CalculatorCard
      titulo="Deuda buena vs. deuda mala"
      descripcion="Amortización francesa estándar. Si indicas el beneficio esperado, se compara contra el coste total del préstamo."
      onSubmit={handleSubmit}
      error={error}
      resultado={
        resultado && (
          <>
            <div className="resultado-linea resultado-principal">
              <span>Cuota mensual</span>
              <strong>{formatEUR(resultado.cuotaMensual)}</strong>
            </div>
            <div className="resultado-linea">
              <span>Coste total</span>
              <strong>{formatEUR(resultado.costeTotal)}</strong>
            </div>
            <div className="resultado-linea">
              <span>Intereses totales</span>
              <strong>{formatEUR(resultado.interesesTotales)}</strong>
            </div>
            {resultado.beneficioNeto !== undefined && (
              <div className="resultado-linea">
                <span>Beneficio neto</span>
                <strong>{formatEUR(resultado.beneficioNeto)}</strong>
              </div>
            )}
            {resultado.veredicto && (
              <p className={`resultado-veredicto ${resultado.veredicto === 'Deuda buena' ? 'buena' : 'mala'}`}>
                {resultado.veredicto}
              </p>
            )}
            <div className="resultado-linea">
              <span>Fondo de reserva recomendado (guarda esto antes de firmar)</span>
              <strong>{formatEUR(resultado.fondoReservaRecomendado)}</strong>
            </div>
          </>
        )
      }
    >
      <NumberField label="Capital del préstamo" suffix="€" value={capital} onChange={setCapital} />
      <p className="calculator-help-text">Cuánto pides prestado.</p>

      <NumberField label="Tasa anual (TIN)" suffix="%" value={tasaAnual} onChange={setTasaAnual} />
      <p className="calculator-help-text">El interés que te cobra el banco (TIN aproximado).</p>

      <NumberField label="Plazo" suffix="años" value={plazoAnios} onChange={setPlazoAnios} />
      <p className="calculator-help-text">Años para devolverlo.</p>

      <label className="calculator-select">
        <span>¿Cómo indicas el beneficio esperado?</span>
        <select value={modoBeneficio} onChange={(e) => setModoBeneficio(e.target.value as ModoBeneficio)}>
          <option value="total">Total del periodo</option>
          <option value="mensual">Mensual</option>
        </select>
      </label>

      <NumberField
        label="Beneficio/ingreso extra esperado (opcional)"
        suffix={modoBeneficio === 'mensual' ? '€/mes' : '€'}
        value={beneficioEsperado}
        onChange={setBeneficioEsperado}
        required={false}
      />
      <p className="calculator-help-text">
        Cuánto vas a ganar gracias a este dinero — ej. el alquiler que vas a cobrar, o el sueldo extra de una
        formación — para que la calculadora te diga si compensa pedirlo prestado.
        {beneficioTotalEquivalente !== null && (
          <> Equivale a {formatEUR(beneficioTotalEquivalente)} en total durante {plazoAnios} años.</>
        )}
      </p>
    </CalculatorCard>
  );
}
