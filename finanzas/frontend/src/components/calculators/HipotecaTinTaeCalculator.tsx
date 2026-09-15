import { useState, type FormEvent } from 'react';
import CalculatorCard from '../CalculatorCard';
import NumberField from '../NumberField';
import { calcularHipotecaTinTae, type HipotecaTinTaeResultado } from '../../lib/calculators';
import { formatEUR } from '../../lib/format';

export default function HipotecaTinTaeCalculator() {
  const [capital, setCapital] = useState('200000');
  const [tinPct, setTinPct] = useState('3');
  const [plazoAnios, setPlazoAnios] = useState('25');
  const [comisionAperturaPct, setComisionAperturaPct] = useState('1');
  const [gastosInicialesFijos, setGastosInicialesFijos] = useState('1500');
  const [seguroAnual, setSeguroAnual] = useState('300');
  const [resultado, setResultado] = useState<HipotecaTinTaeResultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      const r = calcularHipotecaTinTae({
        capital: Number(capital),
        tinPct: Number(tinPct),
        plazoAnios: Number(plazoAnios),
        comisionAperturaPct: comisionAperturaPct ? Number(comisionAperturaPct) : 0,
        gastosInicialesFijos: gastosInicialesFijos ? Number(gastosInicialesFijos) : 0,
        seguroAnual: seguroAnual ? Number(seguroAnual) : 0,
      });
      setResultado(r);
    } catch (err) {
      setResultado(null);
      setError(err instanceof Error ? err.message : 'Datos inválidos');
    }
  };

  const hayComisionOGastos =
    resultado !== null && Math.abs(resultado.impactoComisionYGastosPct) > 0.001;
  const haySeguros = resultado !== null && Math.abs(resultado.impactoSegurosPct) > 0.001;

  return (
    <CalculatorCard
      titulo="Hipoteca — TIN vs. TAE"
      descripcion="El TIN es solo el interés. La TAE añade comisión de apertura, gastos y seguros vinculados: es el coste real de tu hipoteca."
      onSubmit={handleSubmit}
      error={error}
      resultado={
        resultado && (
          <>
            <div className="resultado-linea">
              <span>Cuota mensual</span>
              <strong>{formatEUR(resultado.cuotaMensual)}</strong>
            </div>
            <div className="resultado-linea">
              <span>TIN</span>
              <strong>{resultado.tinPct.toFixed(2)}%</strong>
            </div>
            <div className="resultado-linea resultado-principal">
              <span>TAE real</span>
              <strong>{resultado.taeFinal.toFixed(2)}%</strong>
            </div>
            <div className="resultado-linea">
              <span>Coste total del préstamo (intereses + comisión + gastos + seguros)</span>
              <strong>{formatEUR(resultado.costeTotalPrestamo)}</strong>
            </div>

            <p className="calculator-help-text">
              Tu TIN es {resultado.tinPct.toFixed(2)}%
              {(hayComisionOGastos || haySeguros) && (
                <>
                  {' '}
                  pero la TAE real es {resultado.taeFinal.toFixed(2)}%
                  {hayComisionOGastos && (
                    <>
                      {' '}
                      — la comisión de apertura y gastos suben {resultado.impactoComisionYGastosPct.toFixed(2)}{' '}
                      puntos
                    </>
                  )}
                  {haySeguros && (
                    <>
                      {hayComisionOGastos ? ', los' : ' — los'} seguros vinculados suben{' '}
                      {resultado.impactoSegurosPct.toFixed(2)} puntos más
                    </>
                  )}
                  .
                </>
              )}
              {!hayComisionOGastos && !haySeguros && <> y la TAE real es prácticamente la misma.</>}
            </p>
          </>
        )
      }
    >
      <NumberField label="Capital de la hipoteca" suffix="€" value={capital} onChange={setCapital} />
      <p className="calculator-help-text">Cuánto vas a pedir prestado (el precio de la vivienda menos tu entrada).</p>

      <NumberField label="TIN (interés nominal)" suffix="%" value={tinPct} onChange={setTinPct} />
      <p className="calculator-help-text">
        El tipo de interés "de etiqueta" que te ofrece el banco. Por sí solo NO incluye comisiones ni seguros — por
        eso casi nunca coincide con lo que realmente pagas.
      </p>

      <NumberField label="Plazo" suffix="años" value={plazoAnios} onChange={setPlazoAnios} />
      <p className="calculator-help-text">
        Años para devolver la hipoteca. Cuanto más largo, más baja la cuota mensual pero más intereses totales
        pagas.
      </p>

      <NumberField
        label="Comisión de apertura (opcional)"
        suffix="%"
        value={comisionAperturaPct}
        onChange={setComisionAperturaPct}
        required={false}
      />
      <p className="calculator-help-text">
        Un % del capital que el banco cobra una sola vez al firmar, por formalizar el préstamo. Hoy es cada vez
        menos habitual (0% en muchas ofertas), pero si la tuya la tiene, sube la TAE — sobre todo en hipotecas
        cortas.
      </p>

      <NumberField
        label="Gastos iniciales fijos (opcional)"
        suffix="€"
        value={gastosInicialesFijos}
        onChange={setGastosInicialesFijos}
        required={false}
      />
      <p className="calculator-help-text">Notaría, gestoría, tasación… un importe fijo pagado una única vez.</p>
      <NumberField
        label="Seguro vinculado anual (opcional)"
        suffix="€/año"
        value={seguroAnual}
        onChange={setSeguroAnual}
        required={false}
      />
      <p className="calculator-help-text">
        Seguro de vida/hogar que el banco exige para darte la bonificación en el TIN.
      </p>
    </CalculatorCard>
  );
}
