import { useState, type FormEvent } from 'react';
import CalculatorCard from '../CalculatorCard';
import NumberField from '../NumberField';
import {
  calcularInteresCompuesto,
  simularInteresCompuestoAvanzado,
  generarAñosCrisisAleatorios,
  type InteresCompuestoResultado,
  type Frecuencia,
  type AñoCrisis,
  type RegimenFiscal,
  type SimulacionAvanzadaResult,
} from '../../lib/calculators';
import { formatEUR } from '../../lib/format';

// Fila de edición de un año de crisis. Se maneja como string igual que
// NumberField (permite dejar el campo vacío mientras se escribe) y el
// parseo/validación numérica ocurre al enviar el formulario, igual que en
// el resto de la calculadora.
interface FilaAñoCrisis {
  id: number;
  año: string;
  rendimiento: string;
}

let siguienteIdFila = 1;

export default function InteresCompuestoCalculator() {
  const [capitalInicial, setCapitalInicial] = useState('1000');
  const [tasaAnual, setTasaAnual] = useState('5');
  const [anios, setAnios] = useState('10');
  const [frecuenciaCapitalizacion, setFrecuenciaCapitalizacion] = useState<Frecuencia>('anual');
  const [aportacionPeriodica, setAportacionPeriodica] = useState('');
  const [frecuenciaAportacion, setFrecuenciaAportacion] = useState<Frecuencia>('mensual');
  const [resultado, setResultado] = useState<InteresCompuestoResultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [modoAvanzado, setModoAvanzado] = useState(false);
  const [regimenFiscal, setRegimenFiscal] = useState<RegimenFiscal>('ninguno');
  const [filasCrisis, setFilasCrisis] = useState<FilaAñoCrisis[]>([]);
  const [resultadoAvanzado, setResultadoAvanzado] = useState<SimulacionAvanzadaResult | null>(null);

  // Régimen 'retiros_fifo'
  const [retiroAnual, setRetiroAnual] = useState('');
  const [añoInicioRetiros, setAñoInicioRetiros] = useState('1');

  // Generador aleatorio de años de crisis
  const [probabilidadCrisis, setProbabilidadCrisis] = useState('20');
  const [intensidadMediaCrisis, setIntensidadMediaCrisis] = useState('30');

  const anadirFilaCrisis = () => {
    setFilasCrisis((filas) => [...filas, { id: siguienteIdFila++, año: '', rendimiento: '' }]);
  };

  const eliminarFilaCrisis = (id: number) => {
    setFilasCrisis((filas) => filas.filter((f) => f.id !== id));
  };

  const actualizarFilaCrisis = (id: number, campo: 'año' | 'rendimiento', valor: string) => {
    setFilasCrisis((filas) => filas.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
  };

  // Sustituye por completo la lista de años de crisis actual — no añade a
  // lo que ya hubiera, para que el usuario no se lleve una sorpresa al ver
  // filas mezcladas de origen distinto.
  const generarCrisisAleatorias = () => {
    const aniosNum = Number(anios);
    if (!Number.isInteger(aniosNum) || aniosNum <= 0) {
      setError('Introduce primero un número de años válido para generar años de crisis');
      return;
    }
    const generadas = generarAñosCrisisAleatorios(
      aniosNum,
      Number(probabilidadCrisis) || 0,
      Number(intensidadMediaCrisis) || 0,
    );
    setFilasCrisis(
      generadas.map((c) => ({
        id: siguienteIdFila++,
        año: String(c.año),
        rendimiento: c.rendimiento.toFixed(2),
      })),
    );
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setResultado(null);
    setResultadoAvanzado(null);

    const aniosNum = Number(anios);

    if (!modoAvanzado) {
      try {
        const r = calcularInteresCompuesto({
          capitalInicial: Number(capitalInicial),
          tasaAnualPct: Number(tasaAnual),
          anios: aniosNum,
          frecuenciaCapitalizacion,
          aportacionPeriodica: aportacionPeriodica ? Number(aportacionPeriodica) : 0,
          frecuenciaAportacion,
        });
        setResultado(r);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Datos inválidos');
      }
      return;
    }

    try {
      if (!Number.isInteger(aniosNum) || aniosNum <= 0) {
        throw new Error('En modo avanzado los años deben ser un número entero mayor que cero');
      }

      // Los años de crisis con año fuera de [1, años] se ignoran en el
      // cálculo (no rompen la simulación); avisamos si hay alguno así.
      const añosCrisisValidados: AñoCrisis[] = [];
      for (const fila of filasCrisis) {
        if (fila.año === '' || fila.rendimiento === '') continue;
        const año = Number(fila.año);
        const rendimiento = Number(fila.rendimiento);
        if (!Number.isInteger(año) || año < 1 || año > aniosNum) {
          throw new Error(`El año de crisis "${fila.año}" debe estar entre 1 y ${aniosNum}`);
        }
        if (!Number.isFinite(rendimiento)) {
          throw new Error('El rendimiento de un año de crisis no es un número válido');
        }
        añosCrisisValidados.push({ año, rendimiento });
      }

      // Conversión a aportación anual equivalente: el TOTAL contribuido por
      // año siempre se expresa como una cifra anual, pero la FRECUENCIA real
      // (frecuenciaAportacion) se sigue pasando aparte — la simulación
      // avanzada la necesita para capitalizar cada aportación mensual desde
      // su propio mes de entrada, en vez de tratarlas todas como un único
      // bloque anual (ver el comentario de `capitalizarUnAño` en
      // calculators.ts: ese trato en bloque fue un fallo real que disparaba
      // la ganancia bruta muy por encima de la de la calculadora simple).
      const aportacionBase = aportacionPeriodica ? Number(aportacionPeriodica) : 0;
      const aportacionAnual =
        aportacionBase > 0 && frecuenciaAportacion === 'mensual' ? aportacionBase * 12 : aportacionBase;

      const rAvanzado = simularInteresCompuestoAvanzado({
        capitalInicial: Number(capitalInicial),
        tasaAnualBase: Number(tasaAnual),
        años: aniosNum,
        aportacionAnual,
        frecuenciaCapitalizacion,
        frecuenciaAportacion,
        añosCrisis: añosCrisisValidados,
        regimenFiscal,
        retiroAnual: regimenFiscal === 'retiros_fifo' ? Number(retiroAnual) || 0 : undefined,
        añoInicioRetiros: regimenFiscal === 'retiros_fifo' ? Number(añoInicioRetiros) || 1 : undefined,
      });
      setResultadoAvanzado(rAvanzado);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Datos inválidos');
    }
  };

  return (
    <CalculatorCard
      titulo="Interés compuesto"
      descripcion="Capital final = Principal × (1 + r/n)^(n×t), sumando aportaciones periódicas opcionales."
      ancho="amplio"
      onSubmit={handleSubmit}
      error={error}
      resultado={
        resultado ? (
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
        ) : (
          resultadoAvanzado && (
            <>
              {regimenFiscal === 'retiros_fifo' ? (
                <>
                  <div className="resultado-linea resultado-principal">
                    <span>Total retirado neto</span>
                    <strong>{formatEUR(resultadoAvanzado.totalRetiradoNeto ?? 0)}</strong>
                  </div>
                  <div className="resultado-linea">
                    <span>Total retirado bruto</span>
                    <strong>{formatEUR(resultadoAvanzado.totalRetiradoBruto ?? 0)}</strong>
                  </div>
                  <div className="resultado-linea">
                    <span>Impuestos totales pagados</span>
                    <strong>{formatEUR(resultadoAvanzado.impuestosTotales)}</strong>
                  </div>
                  <div className="resultado-linea">
                    <span>Saldo del fondo restante</span>
                    <strong>{formatEUR(resultadoAvanzado.saldoFinalFondoRestante ?? 0)}</strong>
                  </div>
                  <div className="resultado-linea">
                    <span>Rentabilidad neta total (retirado + fondo restante)</span>
                    <strong>{resultadoAvanzado.rentabilidadNetaTotal.toFixed(2)}%</strong>
                  </div>
                </>
              ) : (
                <>
                  <div className="resultado-linea resultado-principal">
                    <span>Saldo final neto</span>
                    <strong>{formatEUR(resultadoAvanzado.saldoFinalNeto)}</strong>
                  </div>
                  <div className="resultado-linea">
                    <span>Saldo final bruto</span>
                    <strong>{formatEUR(resultadoAvanzado.saldoFinalBruto)}</strong>
                  </div>
                  <div className="resultado-linea">
                    <span>Total aportado (incl. capital inicial)</span>
                    <strong>{formatEUR(resultadoAvanzado.totalAportado)}</strong>
                  </div>
                  <div className="resultado-linea">
                    <span>Ganancia bruta total</span>
                    <strong>{formatEUR(resultadoAvanzado.gananciaTotalBruta)}</strong>
                  </div>
                  <div className="resultado-linea">
                    <span>Impuestos totales pagados</span>
                    <strong>{formatEUR(resultadoAvanzado.impuestosTotales)}</strong>
                  </div>
                  <div className="resultado-linea">
                    <span>Ganancia neta total</span>
                    <strong>{formatEUR(resultadoAvanzado.gananciaTotalNeta)}</strong>
                  </div>
                  <div className="resultado-linea">
                    <span>Rentabilidad neta total</span>
                    <strong>{resultadoAvanzado.rentabilidadNetaTotal.toFixed(2)}%</strong>
                  </div>
                </>
              )}

              <details className="calculator-desglose">
                <summary>Ver desglose año a año</summary>
                <div className="calculator-desglose-tabla-wrap">
                  <table className="calculator-desglose-tabla">
                    <thead>
                      <tr>
                        <th>Año</th>
                        <th>Rendimiento</th>
                        <th>Saldo inicio</th>
                        <th>Aportación</th>
                        <th>Ganancia</th>
                        {regimenFiscal === 'retiros_fifo' && <th>Retiro bruto</th>}
                        {regimenFiscal === 'retiros_fifo' && <th>Retiro neto</th>}
                        <th>Impuesto</th>
                        <th>{regimenFiscal === 'retiros_fifo' ? 'Fondo restante' : 'Saldo fin (neto)'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultadoAvanzado.años.map((añoSimulado) => (
                        <tr key={añoSimulado.año}>
                          <td>{añoSimulado.año}</td>
                          <td>{añoSimulado.rendimientoAplicado.toFixed(2)}%</td>
                          <td>{formatEUR(añoSimulado.saldoInicio)}</td>
                          <td>{formatEUR(añoSimulado.aportacion)}</td>
                          <td>{formatEUR(añoSimulado.gananciaDelAño)}</td>
                          {regimenFiscal === 'retiros_fifo' && (
                            <td>{añoSimulado.retiroBruto ? formatEUR(añoSimulado.retiroBruto) : '—'}</td>
                          )}
                          {regimenFiscal === 'retiros_fifo' && (
                            <td>{añoSimulado.retiroNeto ? formatEUR(añoSimulado.retiroNeto) : '—'}</td>
                          )}
                          <td>
                            {añoSimulado.desgloseImpuesto && añoSimulado.desgloseImpuesto.length > 0 ? (
                              <details className="calculator-desglose-tramos">
                                <summary>{formatEUR(añoSimulado.impuestoPagado)}</summary>
                                <ul>
                                  {añoSimulado.desgloseImpuesto.map((tramo) => (
                                    <li key={tramo.desde}>
                                      {formatEUR(tramo.desde)}–{tramo.hasta === Infinity ? '∞' : formatEUR(tramo.hasta)}
                                      {' '}({(tramo.tipo * 100).toFixed(0)}%): {formatEUR(tramo.baseEnTramo)} → {formatEUR(tramo.cuota)}
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            ) : (
                              formatEUR(añoSimulado.impuestoPagado)
                            )}
                          </td>
                          <td>{formatEUR(añoSimulado.saldoFinNeto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )
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

      <label className="calculator-checkbox">
        <input
          type="checkbox"
          checked={modoAvanzado}
          onChange={(e) => setModoAvanzado(e.target.checked)}
        />
        <span>Modo avanzado (años de crisis + fiscalidad)</span>
      </label>

      {modoAvanzado && (
        <div className="calculator-avanzado">
          <label className="calculator-select">
            <span>Régimen fiscal</span>
            <select value={regimenFiscal} onChange={(e) => setRegimenFiscal(e.target.value as RegimenFiscal)}>
              <option value="ninguno">Ninguno</option>
              <option value="anual">Anual (tipo cripto — tributa cada año)</option>
              <option value="diferido">Diferido (tipo fondo indexado — tributa solo al final)</option>
              <option value="retiros_fifo">
                Retiros programados (FIFO) — vendo poco a poco para pagar menos impuestos
              </option>
            </select>
          </label>

          {regimenFiscal === 'retiros_fifo' && (
            <>
              <NumberField
                label="Retiro anual deseado"
                suffix="€"
                value={retiroAnual}
                onChange={setRetiroAnual}
                required={false}
              />
              <NumberField
                label="Año de inicio de los retiros"
                value={añoInicioRetiros}
                onChange={setAñoInicioRetiros}
                min={1}
                step="1"
              />
            </>
          )}

          <div className="calculator-crisis">
            <span className="calculator-crisis-titulo">Años de crisis (sustituyen la tasa base)</span>

            <div className="calculator-crisis-generador">
              <input
                type="number"
                inputMode="decimal"
                placeholder="Probabilidad %"
                step="any"
                min={0}
                value={probabilidadCrisis}
                onChange={(e) => setProbabilidadCrisis(e.target.value)}
              />
              <input
                type="number"
                inputMode="decimal"
                placeholder="Intensidad media %"
                step="any"
                min={0}
                value={intensidadMediaCrisis}
                onChange={(e) => setIntensidadMediaCrisis(e.target.value)}
              />
              <button type="button" className="calculator-crisis-generar" onClick={generarCrisisAleatorias}>
                Generar años de crisis aleatorios
              </button>
            </div>
            <p className="calculator-help-text">
              Sustituye por completo la lista de años de crisis de abajo — no la añade a lo que ya hubiera.
            </p>

            {filasCrisis.map((fila) => (
              <div className="calculator-crisis-fila" key={fila.id}>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Año"
                  min={1}
                  step="1"
                  value={fila.año}
                  onChange={(e) => actualizarFilaCrisis(fila.id, 'año', e.target.value)}
                />
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="Rendimiento %"
                  step="any"
                  value={fila.rendimiento}
                  onChange={(e) => actualizarFilaCrisis(fila.id, 'rendimiento', e.target.value)}
                />
                <button
                  type="button"
                  className="calculator-crisis-eliminar"
                  onClick={() => eliminarFilaCrisis(fila.id)}
                  aria-label="Eliminar año de crisis"
                >
                  ✕
                </button>
              </div>
            ))}

            <button type="button" className="calculator-crisis-anadir" onClick={anadirFilaCrisis}>
              + Añadir año de crisis
            </button>
          </div>
        </div>
      )}
    </CalculatorCard>
  );
}
