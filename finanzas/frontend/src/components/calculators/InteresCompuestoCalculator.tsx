import { useState, type FormEvent } from 'react';
import CalculatorCard from '../CalculatorCard';
import NumberField from '../NumberField';
import { calcularInteresCompuesto, type InteresCompuestoResultado, type Frecuencia } from '../../lib/calculators';
import { formatEUR } from '../../lib/format';

export default function InteresCompuestoCalculator() {
  const [capitalInicial, setCapitalInicial] = useState('1000');
  const [tasaAnual, setTasaAnual] = useState('5');
  const [anios, setAnios] = useState('10');
  const [frecuenciaCapitalizacion, setFrecuenciaCapitalizacion] = useState<Frecuencia>('anual');
  const [aportacionPeriodica, setAportacionPeriodica] = useState('');
  const [frecuenciaAportacion, setFrecuenciaAportacion] = useState<Frecuencia>('mensual');
  const [resultado, setResultado] = useState<InteresCompuestoResultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      const r = calcularInteresCompuesto({
        capitalInicial: Number(capitalInicial),
        tasaAnualPct: Number(tasaAnual),
        anios: Number(anios),
        frecuenciaCapitalizacion,
        aportacionPeriodica: aportacionPeriodica ? Number(aportacionPeriodica) : 0,
        frecuenciaAportacion,
      });
      setResultado(r);
    } catch (err) {
      setResultado(null);
      setError(err instanceof Error ? err.message : 'Datos inválidos');
    }
  };

  return (
    <CalculatorCard
      titulo="Interés compuesto"
      descripcion="Capital final = Principal × (1 + r/n)^(n×t), sumando aportaciones periódicas opcionales."
      onSubmit={handleSubmit}
      error={error}
      resultado={
        resultado && (
          <>
            <div className="resultado-linea resultado-principal">
              <span>Capital final</span>
              <strong>{formatEUR(resultado.capitalFinal)}</strong>
            </div>
            <div className="resultado-linea">
              <span>Total aportado</span>
              <strong>{formatEUR(resultado.totalAportado)}</strong>
            </div>
            <div className="resultado-linea">
              <span>Intereses ganados</span>
              <strong>{formatEUR(resultado.totalIntereses)}</strong>
            </div>
          </>
        )
      }
    >
      <NumberField label="Capital inicial" suffix="€" value={capitalInicial} onChange={setCapitalInicial} />
      <NumberField label="Tasa anual" suffix="%" value={tasaAnual} onChange={setTasaAnual} />
      <NumberField label="Años" value={anios} onChange={setAnios} />

      <label className="calculator-select">
        <span>Frecuencia de capitalización</span>
        <select
          value={frecuenciaCapitalizacion}
          onChange={(e) => setFrecuenciaCapitalizacion(e.target.value as Frecuencia)}
        >
          <option value="anual">Anual</option>
          <option value="mensual">Mensual</option>
        </select>
      </label>

      <NumberField
        label="Aportación periódica (opcional)"
        suffix="€"
        value={aportacionPeriodica}
        onChange={setAportacionPeriodica}
        required={false}
      />

      <label className="calculator-select">
        <span>Frecuencia de aportación</span>
        <select
          value={frecuenciaAportacion}
          onChange={(e) => setFrecuenciaAportacion(e.target.value as Frecuencia)}
        >
          <option value="anual">Anual</option>
          <option value="mensual">Mensual</option>
        </select>
      </label>
    </CalculatorCard>
  );
}
