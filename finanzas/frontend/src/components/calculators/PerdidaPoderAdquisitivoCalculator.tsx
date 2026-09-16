import { useState, type FormEvent } from 'react';
import CalculatorCard from '../CalculatorCard';
import NumberField from '../NumberField';
import {
  calcularPerdidaPoderAdquisitivo,
  type PerdidaPoderAdquisitivoResultado,
} from '../../lib/calculators';
import { formatEUR } from '../../lib/format';

export default function PerdidaPoderAdquisitivoCalculator() {
  const [capitalInicial, setCapitalInicial] = useState('10000');
  const [inflacionAnualPct, setInflacionAnualPct] = useState('3');
  const [anios, setAnios] = useState('10');
  const [resultado, setResultado] = useState<PerdidaPoderAdquisitivoResultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      const r = calcularPerdidaPoderAdquisitivo({
        capitalInicial: Number(capitalInicial),
        inflacionAnualPct: Number(inflacionAnualPct),
        anios: Number(anios),
      });
      setResultado(r);
    } catch (err) {
      setResultado(null);
      setError(err instanceof Error ? err.message : 'Datos inválidos');
    }
  };

  return (
    <CalculatorCard
      titulo="Pérdida de poder adquisitivo (dinero parado)"
      descripcion="Cuánto vale de verdad tu dinero dentro de X años si lo dejas quieto en vez de invertirlo, descontando la inflación."
      onSubmit={handleSubmit}
      error={error}
      resultado={
        resultado && (
          <>
            <div className="resultado-linea resultado-principal">
              <span>Poder de compra dentro de {anios} años (en euros de hoy)</span>
              <strong>{formatEUR(resultado.valorRealFuturo)}</strong>
            </div>
            <div className="resultado-linea">
              <span>Pérdida de poder adquisitivo</span>
              <strong>{formatEUR(resultado.perdidaPoderAdquisitivo)}</strong>
            </div>
            <div className="resultado-linea">
              <span>Pérdida porcentual</span>
              <strong>{resultado.perdidaPorcentual.toFixed(2)}%</strong>
            </div>
            <p className="calculator-help-text">
              Para comprar dentro de {anios} años lo mismo que hoy comprarías con {formatEUR(Number(capitalInicial))},
              necesitarías tener entonces {formatEUR(resultado.nominalNecesarioParaIgualarHoy)} (en euros de ese
              momento) — esa diferencia es lo que se come la inflación si el dinero se queda quieto.
            </p>
          </>
        )
      }
    >
      <NumberField label="Capital inicial" suffix="€" value={capitalInicial} onChange={setCapitalInicial} />
      <p className="calculator-help-text">El dinero que tienes hoy guardado, sin invertir.</p>

      <NumberField
        label="Inflación anual media esperada"
        suffix="%"
        value={inflacionAnualPct}
        onChange={setInflacionAnualPct}
      />
      <p className="calculator-help-text">
        Cuánto suben los precios cada año de media. El 2-3% es una referencia histórica habitual en la eurozona,
        pero ha habido años muy por encima (2022 rondó el 8-9% en España).
      </p>

      <NumberField label="Años" suffix="años" value={anios} onChange={setAnios} />
      <p className="calculator-help-text">Cuánto tiempo va a estar el dinero parado, sin invertir.</p>
    </CalculatorCard>
  );
}
