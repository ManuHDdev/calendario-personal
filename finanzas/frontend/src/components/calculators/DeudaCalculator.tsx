import { useState, type FormEvent } from 'react';
import CalculatorCard from '../CalculatorCard';
import NumberField from '../NumberField';
import { calcularDeuda, type DeudaResultado } from '../../lib/calculators';
import { formatEUR } from '../../lib/format';

export default function DeudaCalculator() {
  const [capital, setCapital] = useState('5000');
  const [tasaAnual, setTasaAnual] = useState('6');
  const [plazoAnios, setPlazoAnios] = useState('4');
  const [beneficioEsperado, setBeneficioEsperado] = useState('');
  const [resultado, setResultado] = useState<DeudaResultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      const r = calcularDeuda({
        capital: Number(capital),
        tasaAnualPct: Number(tasaAnual),
        plazoAnios: Number(plazoAnios),
        beneficioEsperado: beneficioEsperado ? Number(beneficioEsperado) : undefined,
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
      <NumberField label="Tasa anual (TIN)" suffix="%" value={tasaAnual} onChange={setTasaAnual} />
      <NumberField label="Plazo" suffix="años" value={plazoAnios} onChange={setPlazoAnios} />
      <NumberField
        label="Beneficio/ingreso extra esperado (opcional)"
        suffix="€"
        value={beneficioEsperado}
        onChange={setBeneficioEsperado}
        required={false}
      />
    </CalculatorCard>
  );
}
