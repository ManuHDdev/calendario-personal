import { useState, type FormEvent } from 'react';
import CalculatorCard from '../CalculatorCard';
import NumberField from '../NumberField';
import { calcularColchonSeguridad, type ColchonSeguridadResultado } from '../../lib/calculators';
import { formatEUR } from '../../lib/format';

export default function ColchonCalculator() {
  const [gastosFijosMensuales, setGastosFijosMensuales] = useState('800');
  const [ahorroRestante, setAhorroRestante] = useState('');
  const [resultado, setResultado] = useState<ColchonSeguridadResultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      const r = calcularColchonSeguridad(
        Number(gastosFijosMensuales),
        ahorroRestante ? Number(ahorroRestante) : undefined,
      );
      setResultado(r);
    } catch (err) {
      setResultado(null);
      setError(err instanceof Error ? err.message : 'Datos inválidos');
    }
  };

  return (
    <CalculatorCard
      titulo="Colchón de seguridad post-compra (“llave del colchón”)"
      descripcion="Colchón mínimo = gastos fijos mensuales × 3."
      onSubmit={handleSubmit}
      error={error}
      resultado={
        resultado && (
          <>
            <div className="resultado-linea resultado-principal">
              <span>Colchón mínimo requerido</span>
              <strong>{formatEUR(resultado.colchonMinimo)}</strong>
            </div>
            {resultado.mensaje && (
              <p className={`resultado-veredicto ${resultado.suficiente ? 'buena' : 'mala'}`}>
                {resultado.mensaje}
              </p>
            )}
          </>
        )
      }
    >
      <NumberField
        label="Gastos fijos mensuales"
        suffix="€"
        value={gastosFijosMensuales}
        onChange={setGastosFijosMensuales}
      />
      <NumberField
        label="Ahorro restante tras la compra (opcional)"
        suffix="€"
        value={ahorroRestante}
        onChange={setAhorroRestante}
        required={false}
      />
    </CalculatorCard>
  );
}
