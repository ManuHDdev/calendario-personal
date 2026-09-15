import { useState, type FormEvent } from 'react';
import CalculatorCard from '../CalculatorCard';
import NumberField from '../NumberField';
import { calcularPrecioMaximoVivienda } from '../../lib/calculators';
import { formatEUR } from '../../lib/format';

export default function PrecioMaximoCalculator() {
  const [ahorrosActuales, setAhorrosActuales] = useState('30000');
  const [resultado, setResultado] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      setResultado(calcularPrecioMaximoVivienda(Number(ahorrosActuales)));
    } catch (err) {
      setResultado(null);
      setError(err instanceof Error ? err.message : 'Datos inválidos');
    }
  };

  return (
    <CalculatorCard
      titulo="Precio máximo de vivienda (“llave del ahorro”)"
      descripcion="Precio máximo = ahorros actuales / 30%."
      onSubmit={handleSubmit}
      error={error}
      resultado={
        resultado !== null && (
          <div className="resultado-linea resultado-principal">
            <span>Precio máximo de vivienda</span>
            <strong>{formatEUR(resultado)}</strong>
          </div>
        )
      }
    >
      <NumberField label="Ahorros actuales" suffix="€" value={ahorrosActuales} onChange={setAhorrosActuales} />
    </CalculatorCard>
  );
}
