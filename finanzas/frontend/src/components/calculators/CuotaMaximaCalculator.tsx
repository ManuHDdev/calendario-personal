import { useState, type FormEvent } from 'react';
import CalculatorCard from '../CalculatorCard';
import NumberField from '../NumberField';
import { calcularCuotaMaximaHipoteca } from '../../lib/calculators';
import { formatEUR } from '../../lib/format';

export default function CuotaMaximaCalculator() {
  const [sueldoNetoMensual, setSueldoNetoMensual] = useState('2000');
  const [resultado, setResultado] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      setResultado(calcularCuotaMaximaHipoteca(Number(sueldoNetoMensual)));
    } catch (err) {
      setResultado(null);
      setError(err instanceof Error ? err.message : 'Datos inválidos');
    }
  };

  return (
    <CalculatorCard
      titulo="Cuota máxima de hipoteca (“llave de la cuota”)"
      descripcion="Cuota máxima = sueldo neto mensual × 35%."
      onSubmit={handleSubmit}
      error={error}
      resultado={
        resultado !== null && (
          <div className="resultado-linea resultado-principal">
            <span>Cuota mensual máxima recomendada</span>
            <strong>{formatEUR(resultado)}</strong>
          </div>
        )
      }
    >
      <NumberField
        label="Sueldo neto mensual"
        suffix="€"
        value={sueldoNetoMensual}
        onChange={setSueldoNetoMensual}
      />
    </CalculatorCard>
  );
}
