import { useState, type FormEvent } from 'react';
import CalculatorCard from '../CalculatorCard';
import NumberField from '../NumberField';
import { calcularAhorroNecesario, type AhorroNecesarioResultado } from '../../lib/calculators';
import { formatEUR } from '../../lib/format';

export default function AhorroNecesarioCalculator() {
  const [precioVivienda, setPrecioVivienda] = useState('200000');
  const [resultado, setResultado] = useState<AhorroNecesarioResultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      setResultado(calcularAhorroNecesario(Number(precioVivienda)));
    } catch (err) {
      setResultado(null);
      setError(err instanceof Error ? err.message : 'Datos inválidos');
    }
  };

  return (
    <CalculatorCard
      titulo="Ahorro necesario para comprar"
      descripcion="Barrera de entrada = 20% de entrada + 10% de gastos e impuestos."
      onSubmit={handleSubmit}
      error={error}
      resultado={
        resultado && (
          <>
            <div className="resultado-linea resultado-principal">
              <span>Ahorro total necesario</span>
              <strong>{formatEUR(resultado.ahorroNecesario)}</strong>
            </div>
            <div className="resultado-linea">
              <span>Entrada (20%)</span>
              <strong>{formatEUR(resultado.entrada)}</strong>
            </div>
            <div className="resultado-linea">
              <span>Gastos e impuestos (10%)</span>
              <strong>{formatEUR(resultado.gastos)}</strong>
            </div>
          </>
        )
      }
    >
      <NumberField label="Precio de la vivienda" suffix="€" value={precioVivienda} onChange={setPrecioVivienda} />
    </CalculatorCard>
  );
}
