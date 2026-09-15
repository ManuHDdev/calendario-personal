import { useState, type FormEvent } from 'react';
import CalculatorCard from '../CalculatorCard';
import NumberField from '../NumberField';
import { calcularPrestamoMaximo } from '../../lib/calculators';
import { formatEUR } from '../../lib/format';

export default function PrestamoMaximoCalculator() {
  const [salarioNetoMensual, setSalarioNetoMensual] = useState('2000');
  const [resultado, setResultado] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      setResultado(calcularPrestamoMaximo(Number(salarioNetoMensual)));
    } catch (err) {
      setResultado(null);
      setError(err instanceof Error ? err.message : 'Datos inválidos');
    }
  };

  return (
    <CalculatorCard
      titulo="Regla del ×4 — préstamo máximo saludable"
      descripcion="Préstamo máximo = salario neto anual × 4."
      onSubmit={handleSubmit}
      error={error}
      resultado={
        resultado !== null && (
          <div className="resultado-linea resultado-principal">
            <span>Préstamo máximo recomendado</span>
            <strong>{formatEUR(resultado)}</strong>
          </div>
        )
      }
    >
      <NumberField
        label="Salario neto mensual"
        suffix="€"
        value={salarioNetoMensual}
        onChange={setSalarioNetoMensual}
      />
    </CalculatorCard>
  );
}
