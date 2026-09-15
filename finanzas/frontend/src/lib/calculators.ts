// Calculadoras financieras — funciones puras, sin efectos secundarios,
// pensadas para correr enteramente en el navegador. Cada función valida sus
// propios inputs (no negativos) y lanza si algo no tiene sentido; la UI
// (ver components/CalculatorCard.tsx) atrapa el error y lo muestra al lado
// del formulario en vez de dejar que la calculadora reviente en silencio.

export type Frecuencia = 'anual' | 'mensual';

const PERIODOS_POR_ANIO: Record<Frecuencia, number> = {
  anual: 1,
  mensual: 12,
};

function validarNoNegativo(valor: number, nombre: string): void {
  if (!Number.isFinite(valor) || valor < 0) {
    throw new Error(`${nombre} no puede ser negativo`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Interés compuesto (con aportaciones periódicas opcionales)
// ─────────────────────────────────────────────────────────────────────────

export interface InteresCompuestoInput {
  capitalInicial: number;
  tasaAnualPct: number;
  anios: number;
  frecuenciaCapitalizacion: Frecuencia;
  aportacionPeriodica?: number;
  frecuenciaAportacion?: Frecuencia;
}

export interface InteresCompuestoResultado {
  capitalFinal: number;
  totalAportado: number;
  totalIntereses: number;
}

export function calcularInteresCompuesto(
  input: InteresCompuestoInput,
): InteresCompuestoResultado {
  const {
    capitalInicial,
    tasaAnualPct,
    anios,
    frecuenciaCapitalizacion,
    aportacionPeriodica = 0,
    frecuenciaAportacion = frecuenciaCapitalizacion,
  } = input;

  validarNoNegativo(capitalInicial, 'El capital inicial');
  validarNoNegativo(tasaAnualPct, 'La tasa anual');
  validarNoNegativo(anios, 'Los años');
  validarNoNegativo(aportacionPeriodica, 'La aportación periódica');

  const n = PERIODOS_POR_ANIO[frecuenciaCapitalizacion];
  const r = tasaAnualPct / 100;
  const periodosTotales = n * anios;

  // Capital inicial compuesto: P(1 + r/n)^(n*t)
  const capitalInicialFinal = capitalInicial * Math.pow(1 + r / n, periodosTotales);

  // Cada aportación capitaliza desde su momento de entrada hasta el final del
  // plazo, con la misma tasa periódica de capitalización.
  let totalAportado = 0;
  let aportacionesFinal = 0;

  if (aportacionPeriodica > 0 && anios > 0) {
    const m = PERIODOS_POR_ANIO[frecuenciaAportacion];
    const numAportaciones = Math.round(m * anios);
    totalAportado = aportacionPeriodica * numAportaciones;

    for (let i = 1; i <= numAportaciones; i++) {
      const tiempoRestanteAnios = anios - i / m;
      const periodosRestantes = tiempoRestanteAnios * n;
      aportacionesFinal += aportacionPeriodica * Math.pow(1 + r / n, periodosRestantes);
    }
  }

  const capitalFinal = capitalInicialFinal + aportacionesFinal;
  const totalIntereses = capitalFinal - capitalInicial - totalAportado;

  return { capitalFinal, totalAportado, totalIntereses };
}

// ─────────────────────────────────────────────────────────────────────────
// 1b. Interés compuesto — modo avanzado (simulación año a año con años de
//     crisis que sustituyen la tasa base y fiscalidad de la base del ahorro)
// ─────────────────────────────────────────────────────────────────────────
//
// A diferencia de calcularInteresCompuesto (que capitaliza en bloque con la
// fórmula cerrada), el modo avanzado SIEMPRE simula año a año: los años de
// crisis y los impuestos son eventos anuales que no se pueden expresar en una
// fórmula cerrada. Si la calculadora simple tenía una aportación periódica
// mensual, la UI la convierte a su equivalente anual (mensual × 12) antes de
// llamar a esta función — aquí solo se recibe `aportacionAnual`.

// Tramos 2025 (declaración 2026) de la base del ahorro del IRPF — escala
// estatal única, igual en todo el territorio común, no depende de la
// comunidad autónoma ni del resto de rentas del contribuyente.
const TRAMOS_BASE_AHORRO_IRPF = [
  { hasta: 6_000, tipo: 0.19 },
  { hasta: 50_000, tipo: 0.21 },
  { hasta: 200_000, tipo: 0.23 },
  { hasta: 300_000, tipo: 0.27 },
  { hasta: Infinity, tipo: 0.3 },
];

// Impuesto progresivo por tramos sobre la base del ahorro: cada tramo tributa
// solo por su propio intervalo (nunca el tipo marginal sobre toda la base).
export function calcularImpuestoProgresivoAhorro(base: number): number {
  if (!Number.isFinite(base) || base <= 0) return 0;

  let impuesto = 0;
  let restante = base;
  let sueloTramo = 0;

  for (const tramo of TRAMOS_BASE_AHORRO_IRPF) {
    const anchoTramo = tramo.hasta - sueloTramo;
    const baseEnTramo = Math.min(restante, anchoTramo);
    impuesto += baseEnTramo * tramo.tipo;
    restante -= baseEnTramo;
    sueloTramo = tramo.hasta;
    if (restante <= 0) break;
  }

  return impuesto;
}

export interface AñoCrisis {
  año: number; // 1..años de la simulación
  rendimiento: number; // % de ese año, sustituye a la tasa base (puede ser negativo)
}

export type RegimenFiscal = 'ninguno' | 'anual' | 'diferido';

export interface SimulacionAvanzadaInput {
  capitalInicial: number;
  tasaAnualBase: number; // %
  años: number;
  aportacionAnual?: number; // ya convertida a equivalente anual por la UI
  añosCrisis: AñoCrisis[];
  regimenFiscal: RegimenFiscal;
}

export interface AñoSimulado {
  año: number;
  rendimientoAplicado: number; // % realmente aplicado ese año (base o de crisis)
  saldoInicio: number;
  aportacion: number;
  gananciaDelAño: number; // bruta, antes de impuestos
  impuestoPagado: number; // 0 salvo régimen 'anual', o 'diferido' en el último año
  saldoFinBruto: number; // saldo antes de restar el impuesto de este año
  saldoFinNeto: number; // saldoFinBruto - impuestoPagado de este año
}

export interface SimulacionAvanzadaResult {
  años: AñoSimulado[];
  totalAportado: number; // incluye el capital inicial (ver nota en el informe)
  saldoFinalBruto: number;
  saldoFinalNeto: number;
  impuestosTotales: number;
  gananciaTotalBruta: number;
  gananciaTotalNeta: number;
  rentabilidadNetaTotal: number; // % = (saldoFinalNeto - totalAportado) / totalAportado * 100
}

interface PerdidaPendiente {
  añoOrigen: number;
  importe: number;
}

export function simularInteresCompuestoAvanzado(
  input: SimulacionAvanzadaInput,
): SimulacionAvanzadaResult {
  const {
    capitalInicial,
    tasaAnualBase,
    años,
    aportacionAnual = 0,
    añosCrisis,
    regimenFiscal,
  } = input;

  validarNoNegativo(capitalInicial, 'El capital inicial');
  validarNoNegativo(tasaAnualBase, 'La tasa anual base');
  validarNoNegativo(aportacionAnual, 'La aportación anual');
  if (!Number.isInteger(años) || años <= 0) {
    throw new Error('Los años deben ser un número entero mayor que cero');
  }

  // Último rendimiento de crisis definido para cada año gana ("last one wins"
  // ante duplicados, resuelto de forma natural por el propio Map).
  const rendimientoCrisisPorAño = new Map<number, number>();
  for (const crisis of añosCrisis) {
    rendimientoCrisisPorAño.set(crisis.año, crisis.rendimiento);
  }

  const perdidasPendientes: PerdidaPendiente[] = []; // FIFO por añoOrigen ascendente
  const añosSimulados: AñoSimulado[] = [];

  let saldo = capitalInicial;
  let impuestosTotales = 0;

  for (let año = 1; año <= años; año++) {
    const rendimientoAplicado = rendimientoCrisisPorAño.has(año)
      ? rendimientoCrisisPorAño.get(año)!
      : tasaAnualBase;

    const saldoInicio = saldo;
    saldo += aportacionAnual;

    const gananciaDelAño = saldo * (rendimientoAplicado / 100);
    saldo += gananciaDelAño;

    let impuestoPagado = 0;
    const saldoFinBruto = saldo;

    if (regimenFiscal === 'anual') {
      // Las pérdidas caducan a los 4 años de generarse (año > añoOrigen + 4).
      for (let i = perdidasPendientes.length - 1; i >= 0; i--) {
        if (año > perdidasPendientes[i].añoOrigen + 4) {
          perdidasPendientes.splice(i, 1);
        }
      }

      if (gananciaDelAño > 0) {
        let gananciaCompensable = gananciaDelAño;
        for (const perdida of perdidasPendientes) {
          if (gananciaCompensable <= 0) break;
          const compensado = Math.min(perdida.importe, gananciaCompensable);
          perdida.importe -= compensado;
          gananciaCompensable -= compensado;
        }
        for (let i = perdidasPendientes.length - 1; i >= 0; i--) {
          if (perdidasPendientes[i].importe <= 0) perdidasPendientes.splice(i, 1);
        }

        const baseImponible = Math.max(0, gananciaCompensable);
        impuestoPagado = calcularImpuestoProgresivoAhorro(baseImponible);
        saldo -= impuestoPagado;
        impuestosTotales += impuestoPagado;
      } else if (gananciaDelAño < 0) {
        perdidasPendientes.push({ añoOrigen: año, importe: -gananciaDelAño });
      }
    }
    // regimenFiscal 'diferido' y 'ninguno': no se paga nada año a año; el
    // 'diferido' liquida una única vez al final (ver más abajo).

    añosSimulados.push({
      año,
      rendimientoAplicado,
      saldoInicio,
      aportacion: aportacionAnual,
      gananciaDelAño,
      impuestoPagado,
      saldoFinBruto,
      saldoFinNeto: saldoFinBruto - impuestoPagado,
    });
  }

  // "total aportado" incluye el capital inicial: es la base que usa el
  // régimen diferido para liquidar ("final gross balance − total
  // contributed, including initial capital") y también sirve como
  // denominador de la rentabilidad neta total.
  const totalAportado = capitalInicial + aportacionAnual * años;

  const ultimoAño = añosSimulados[añosSimulados.length - 1];
  let saldoFinalBruto = ultimoAño.saldoFinBruto;
  let saldoFinalNeto = ultimoAño.saldoFinNeto;

  if (regimenFiscal === 'diferido') {
    const gananciaTotalParaImpuesto = Math.max(0, saldoFinalBruto - totalAportado);
    const impuestoFinal = calcularImpuestoProgresivoAhorro(gananciaTotalParaImpuesto);
    impuestosTotales = impuestoFinal;
    saldoFinalNeto = saldoFinalBruto - impuestoFinal;

    ultimoAño.impuestoPagado = impuestoFinal;
    ultimoAño.saldoFinNeto = saldoFinalNeto;
  }

  const gananciaTotalBruta = saldoFinalBruto - totalAportado;
  const gananciaTotalNeta = saldoFinalNeto - totalAportado;
  const rentabilidadNetaTotal =
    totalAportado > 0 ? ((saldoFinalNeto - totalAportado) / totalAportado) * 100 : 0;

  return {
    años: añosSimulados,
    totalAportado,
    saldoFinalBruto,
    saldoFinalNeto,
    impuestosTotales,
    gananciaTotalBruta,
    gananciaTotalNeta,
    rentabilidadNetaTotal,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Regla del ×4 — préstamo máximo saludable
// ─────────────────────────────────────────────────────────────────────────

export function calcularPrestamoMaximo(salarioNetoMensual: number): number {
  validarNoNegativo(salarioNetoMensual, 'El salario neto mensual');
  const salarioNetoAnual = salarioNetoMensual * 12;
  return salarioNetoAnual * 4;
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Ahorro necesario para comprar (barrera de entrada)
// ─────────────────────────────────────────────────────────────────────────

export interface AhorroNecesarioResultado {
  ahorroNecesario: number;
  entrada: number;
  gastos: number;
}

export function calcularAhorroNecesario(precioVivienda: number): AhorroNecesarioResultado {
  validarNoNegativo(precioVivienda, 'El precio de la vivienda');
  const entrada = precioVivienda * 0.2;
  const gastos = precioVivienda * 0.1;
  return { ahorroNecesario: entrada + gastos, entrada, gastos };
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Cuota máxima de hipoteca ("llave de la cuota")
// ─────────────────────────────────────────────────────────────────────────

export function calcularCuotaMaximaHipoteca(sueldoNetoMensual: number): number {
  validarNoNegativo(sueldoNetoMensual, 'El sueldo neto mensual');
  return sueldoNetoMensual * 0.35;
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Precio máximo de vivienda según ahorros ("llave del ahorro")
// ─────────────────────────────────────────────────────────────────────────

export function calcularPrecioMaximoVivienda(ahorrosActuales: number): number {
  validarNoNegativo(ahorrosActuales, 'Los ahorros actuales');
  return ahorrosActuales / 0.3;
}

// ─────────────────────────────────────────────────────────────────────────
// 6. Colchón de seguridad post-compra ("llave del colchón")
// ─────────────────────────────────────────────────────────────────────────

export interface ColchonSeguridadResultado {
  colchonMinimo: number;
  suficiente?: boolean;
  mensaje?: string;
}

export function calcularColchonSeguridad(
  gastosFijosMensuales: number,
  ahorroRestante?: number,
): ColchonSeguridadResultado {
  validarNoNegativo(gastosFijosMensuales, 'Los gastos fijos mensuales');
  const colchonMinimo = gastosFijosMensuales * 3;

  if (ahorroRestante === undefined) {
    return { colchonMinimo };
  }

  validarNoNegativo(ahorroRestante, 'El ahorro restante');
  const suficiente = ahorroRestante >= colchonMinimo;
  return {
    colchonMinimo,
    suficiente,
    mensaje: suficiente
      ? 'El ahorro restante cubre el colchón mínimo recomendado.'
      : 'El ahorro restante no cubre el colchón mínimo recomendado.',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 7. Deuda buena vs. deuda mala (comparador de préstamo)
// ─────────────────────────────────────────────────────────────────────────

export interface DeudaInput {
  capital: number;
  tasaAnualPct: number;
  plazoAnios: number;
  beneficioEsperado?: number;
}

export interface DeudaResultado {
  cuotaMensual: number;
  costeTotal: number;
  interesesTotales: number;
  fondoReservaRecomendado: number;
  beneficioNeto?: number;
  veredicto?: 'Deuda buena' | 'Deuda mala';
}

export function calcularDeuda(input: DeudaInput): DeudaResultado {
  const { capital, tasaAnualPct, plazoAnios, beneficioEsperado } = input;

  validarNoNegativo(capital, 'El capital');
  validarNoNegativo(tasaAnualPct, 'La tasa anual');
  if (!Number.isFinite(plazoAnios) || plazoAnios <= 0) {
    throw new Error('El plazo en años debe ser mayor que cero');
  }

  const numeroCuotas = Math.round(plazoAnios * 12);
  const tasaMensual = tasaAnualPct / 100 / 12;

  // Amortización francesa estándar: cuota = P·r(1+r)^n / ((1+r)^n − 1)
  const cuotaMensual =
    tasaMensual === 0
      ? capital / numeroCuotas
      : (capital * tasaMensual * Math.pow(1 + tasaMensual, numeroCuotas)) /
        (Math.pow(1 + tasaMensual, numeroCuotas) - 1);

  const costeTotal = cuotaMensual * numeroCuotas;
  const interesesTotales = costeTotal - capital;
  const fondoReservaRecomendado = cuotaMensual * 12;

  const resultado: DeudaResultado = {
    cuotaMensual,
    costeTotal,
    interesesTotales,
    fondoReservaRecomendado,
  };

  if (beneficioEsperado !== undefined) {
    validarNoNegativo(beneficioEsperado, 'El beneficio esperado');
    const beneficioNeto = beneficioEsperado - costeTotal;
    resultado.beneficioNeto = beneficioNeto;
    resultado.veredicto = beneficioNeto > 0 ? 'Deuda buena' : 'Deuda mala';
  }

  return resultado;
}
