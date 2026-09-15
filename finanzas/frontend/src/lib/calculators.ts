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
