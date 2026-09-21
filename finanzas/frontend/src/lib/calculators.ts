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

export type RegimenFiscal = 'ninguno' | 'anual' | 'diferido' | 'retiros_fifo';

export interface SimulacionAvanzadaInput {
  capitalInicial: number;
  tasaAnualBase: number; // %
  años: number;
  aportacionAnual?: number; // ya convertida a equivalente anual por la UI
  añosCrisis: AñoCrisis[];
  regimenFiscal: RegimenFiscal;
  retiroAnual?: number; // importe BRUTO que se intenta retirar cada año — solo régimen 'retiros_fifo'
  añoInicioRetiros?: number; // primer año (1..años) en el que empiezan los retiros — solo régimen 'retiros_fifo'
}

export interface AñoSimulado {
  año: number;
  rendimientoAplicado: number; // % realmente aplicado ese año (base o de crisis)
  saldoInicio: number;
  aportacion: number;
  gananciaDelAño: number; // bruta, antes de impuestos
  impuestoPagado: number; // 0 salvo régimen 'anual', 'diferido' en el último año, o los años con retiro en 'retiros_fifo'
  saldoFinBruto: number; // saldo antes de restar el impuesto de este año
  saldoFinNeto: number; // saldoFinBruto - impuestoPagado de este año (en 'retiros_fifo', saldo del FONDO restante, ver saldoFinalFondoRestante)
  retiroBruto?: number; // solo régimen 'retiros_fifo': importe retirado ese año, antes de impuesto
  retiroNeto?: number; // solo régimen 'retiros_fifo': retiroBruto - impuestoPagado ese año
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
  totalRetiradoBruto?: number; // solo régimen 'retiros_fifo'
  totalRetiradoNeto?: number; // solo régimen 'retiros_fifo'
  saldoFinalFondoRestante?: number; // solo régimen 'retiros_fifo' — mismo valor que saldoFinalNeto en ese régimen
}

interface PerdidaPendiente {
  añoOrigen: number;
  importe: number;
}

// ─────────────────────────────────────────────────────────────────────────
// 1c. Régimen 'retiros_fifo' — retiros programados con contabilidad FIFO
// ─────────────────────────────────────────────────────────────────────────
//
// A diferencia de 'anual' (tributa toda la ganancia del año) y 'diferido'
// (tributa todo de golpe al final), aquí el usuario retira una cantidad fija
// cada año a partir de un año concreto. Cada retiro tributa solo por la
// ganancia REALIZADA en ese retiro (método FIFO obligatorio en España: se
// entiende vendida primero la aportación más antigua), lo que en la práctica
// suele repartir la fiscalidad en tramos bajos del IRPF en vez de un pelotazo
// fiscal único.
//
// El estado se modela como una lista de "lotes" (uno por capital inicial y
// uno por cada aportación anual), cada uno con su propio coste de adquisición
// (costeBasisRestante) y su valor de mercado actualizado (valorActual). Un
// retiro consume lotes en orden FIFO (añoOrigen ascendente).
interface LoteFifo {
  añoOrigen: number; // 0 = capital inicial, N = aportación del año N
  costeBasisRestante: number;
  valorActual: number;
}

interface SimulacionFifoInput {
  capitalInicial: number;
  tasaAnualBase: number;
  años: number;
  aportacionAnual: number;
  rendimientoCrisisPorAño: Map<number, number>;
  retiroAnual: number;
  añoInicioRetiros: number;
}

function simularRetirosFifo(input: SimulacionFifoInput): SimulacionAvanzadaResult {
  const {
    capitalInicial,
    tasaAnualBase,
    años,
    aportacionAnual,
    rendimientoCrisisPorAño,
    retiroAnual,
    añoInicioRetiros,
  } = input;

  const lotes: LoteFifo[] = [
    { añoOrigen: 0, costeBasisRestante: capitalInicial, valorActual: capitalInicial },
  ];
  const perdidasPendientes: PerdidaPendiente[] = []; // misma regla de caducidad a 4 años que el régimen 'anual'
  const añosSimulados: AñoSimulado[] = [];

  let impuestosTotales = 0;
  let totalRetiradoBruto = 0;
  let totalRetiradoNeto = 0;

  const sumaValorActual = () => lotes.reduce((suma, lote) => suma + lote.valorActual, 0);

  for (let año = 1; año <= años; año++) {
    const rendimientoAplicado = rendimientoCrisisPorAño.has(año)
      ? rendimientoCrisisPorAño.get(año)!
      : tasaAnualBase;

    const saldoInicio = sumaValorActual();

    if (aportacionAnual > 0) {
      lotes.push({ añoOrigen: año, costeBasisRestante: aportacionAnual, valorActual: aportacionAnual });
    }

    for (const lote of lotes) {
      lote.valorActual *= 1 + rendimientoAplicado / 100;
    }

    const gananciaDelAño = sumaValorActual() - saldoInicio - aportacionAnual;

    let retiroBruto = 0;
    let retiroNeto = 0;
    let impuestoPagado = 0;

    if (año >= añoInicioRetiros) {
      const poolTotal = sumaValorActual();
      retiroBruto = Math.min(retiroAnual, poolTotal);
      let retiroRestante = retiroBruto;
      let gananciaRealizadaDelAño = 0;

      // FIFO: consume el lote más antiguo primero.
      const lotesOrdenados = [...lotes].sort((a, b) => a.añoOrigen - b.añoOrigen);
      for (const lote of lotesOrdenados) {
        if (retiroRestante <= 0) break;
        if (lote.valorActual <= 0) continue;
        const consumido = Math.min(lote.valorActual, retiroRestante);
        const fraccion = consumido / lote.valorActual;
        const costeBasisConsumido = lote.costeBasisRestante * fraccion;
        const gananciaDeEsteLote = consumido - costeBasisConsumido;
        lote.valorActual -= consumido;
        lote.costeBasisRestante -= costeBasisConsumido;
        gananciaRealizadaDelAño += gananciaDeEsteLote;
        retiroRestante -= consumido;
      }

      // Limpieza de lotes agotados (evita arrastrar basura de coma flotante).
      for (let i = lotes.length - 1; i >= 0; i--) {
        if (lotes[i].valorActual <= 1e-9) lotes.splice(i, 1);
      }

      // Compensación de pérdidas a 4 años, idéntica a la del régimen 'anual'.
      for (let i = perdidasPendientes.length - 1; i >= 0; i--) {
        if (año > perdidasPendientes[i].añoOrigen + 4) {
          perdidasPendientes.splice(i, 1);
        }
      }

      if (gananciaRealizadaDelAño > 0) {
        let gananciaCompensable = gananciaRealizadaDelAño;
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
      } else if (gananciaRealizadaDelAño < 0) {
        perdidasPendientes.push({ añoOrigen: año, importe: -gananciaRealizadaDelAño });
      }

      // El impuesto se paga con el dinero retirado, no reduce el fondo.
      retiroNeto = retiroBruto - impuestoPagado;
      impuestosTotales += impuestoPagado;
      totalRetiradoBruto += retiroBruto;
      totalRetiradoNeto += retiroNeto;
    }

    const saldoFinFondo = sumaValorActual();

    añosSimulados.push({
      año,
      rendimientoAplicado,
      saldoInicio,
      aportacion: aportacionAnual,
      gananciaDelAño,
      impuestoPagado,
      saldoFinBruto: saldoFinFondo + retiroBruto, // fondo antes de restar el retiro de este año
      saldoFinNeto: saldoFinFondo,
      retiroBruto,
      retiroNeto,
    });
  }

  const totalAportado = capitalInicial + aportacionAnual * años;
  const saldoFinalFondoRestante = sumaValorActual();

  // Criterio explícito (pedido en el encargo): saldoFinalNeto/saldoFinalBruto
  // representan SOLO el fondo restante, sin volver a sumar lo ya retirado —
  // así el campo significa lo mismo en todos los regímenes ("lo que queda
  // invertido"). Pero gananciaTotalNeta/gananciaTotalBruta/rentabilidadNetaTotal
  // SÍ incluyen lo retirado (bruto/neto según corresponda): de lo contrario el
  // dinero que el usuario ya se llevó a casa desaparecería del cálculo de
  // rentabilidad, dando una cifra artificialmente mala.
  const saldoFinalBruto = saldoFinalFondoRestante;
  const saldoFinalNeto = saldoFinalFondoRestante;
  const gananciaTotalBruta = saldoFinalBruto + totalRetiradoBruto - totalAportado;
  const gananciaTotalNeta = saldoFinalNeto + totalRetiradoNeto - totalAportado;
  const rentabilidadNetaTotal =
    totalAportado > 0
      ? ((saldoFinalNeto + totalRetiradoNeto - totalAportado) / totalAportado) * 100
      : 0;

  return {
    años: añosSimulados,
    totalAportado,
    saldoFinalBruto,
    saldoFinalNeto,
    impuestosTotales,
    gananciaTotalBruta,
    gananciaTotalNeta,
    rentabilidadNetaTotal,
    totalRetiradoBruto,
    totalRetiradoNeto,
    saldoFinalFondoRestante,
  };
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
    retiroAnual = 0,
    añoInicioRetiros = 1,
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

  if (regimenFiscal === 'retiros_fifo') {
    validarNoNegativo(retiroAnual, 'El retiro anual');
    if (!Number.isInteger(añoInicioRetiros) || añoInicioRetiros < 1 || añoInicioRetiros > años) {
      throw new Error(`El año de inicio de los retiros debe estar entre 1 y ${años}`);
    }
    return simularRetirosFifo({
      capitalInicial,
      tasaAnualBase,
      años,
      aportacionAnual,
      rendimientoCrisisPorAño,
      retiroAnual,
      añoInicioRetiros,
    });
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
// 1d. Generador aleatorio de años de crisis
// ─────────────────────────────────────────────────────────────────────────
//
// Ayuda a rellenar rápido el editor de años de crisis del modo avanzado con
// un escenario plausible en vez de tener que inventarse los años a mano.
// `rng` es inyectable (por defecto Math.random) para que los tests puedan
// pasar una secuencia determinista.
export function generarAñosCrisisAleatorios(
  años: number,
  probabilidadCrisisPct: number,
  intensidadMediaPct: number,
  rng: () => number = Math.random,
): AñoCrisis[] {
  validarNoNegativo(años, 'Los años');
  validarNoNegativo(probabilidadCrisisPct, 'La probabilidad de crisis');
  validarNoNegativo(intensidadMediaPct, 'La intensidad media');

  const resultado: AñoCrisis[] = [];
  for (let año = 1; año <= años; año++) {
    if (rng() < probabilidadCrisisPct / 100) {
      const magnitud = intensidadMediaPct * (0.5 + rng());
      resultado.push({ año, rendimiento: -magnitud });
    }
  }
  return resultado;
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

// Amortización francesa estándar: cuota = P·r(1+r)^n / ((1+r)^n − 1), con
// r = tasa mensual y n = número de cuotas. Compartida por calcularDeuda y
// las calculadoras de hipoteca/alquiler, que la necesitan con los mismos
// números exactos para que TIN, TAE y cash-on-cash sean coherentes entre sí.
function amortizacionFrancesa(capital: number, tasaAnualPct: number, numeroCuotas: number): number {
  const tasaMensual = tasaAnualPct / 100 / 12;
  if (tasaMensual === 0) return capital / numeroCuotas;
  return (
    (capital * tasaMensual * Math.pow(1 + tasaMensual, numeroCuotas)) /
    (Math.pow(1 + tasaMensual, numeroCuotas) - 1)
  );
}

export function calcularDeuda(input: DeudaInput): DeudaResultado {
  const { capital, tasaAnualPct, plazoAnios, beneficioEsperado } = input;

  validarNoNegativo(capital, 'El capital');
  validarNoNegativo(tasaAnualPct, 'La tasa anual');
  if (!Number.isFinite(plazoAnios) || plazoAnios <= 0) {
    throw new Error('El plazo en años debe ser mayor que cero');
  }

  const numeroCuotas = Math.round(plazoAnios * 12);
  const cuotaMensual = amortizacionFrancesa(capital, tasaAnualPct, numeroCuotas);

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

// ─────────────────────────────────────────────────────────────────────────
// 8. Hipoteca — TIN vs. TAE
// ─────────────────────────────────────────────────────────────────────────
//
// El TIN es solo el precio del dinero; la TAE añade comisión de apertura,
// gastos iniciales y seguros vinculados prorrateados a lo largo de la vida
// del préstamo, expresado como un tipo anual equivalente. No hay fórmula
// cerrada para despejar la TAE con comisiones y seguros de por medio, así
// que se resuelve numéricamente por bisección (método estándar del Banco de
// España): se busca el tipo mensual `i` que iguala el valor presente de
// todos los pagos mensuales al capital NETO realmente recibido.

export interface HipotecaTinTaeInput {
  capital: number;
  tinPct: number;
  plazoAnios: number;
  comisionAperturaPct?: number;
  gastosInicialesFijos?: number;
  seguroAnual?: number;
}

export interface HipotecaTinTaeResultado {
  cuotaMensual: number;
  costeTotalIntereses: number;
  costeAperturaYGastos: number;
  costeSegurosTotal: number;
  costeTotalPrestamo: number;
  tinPct: number;
  taeSoloTin: number; // %, escenario sin comisión/gastos/seguros — sanity check, debe ≈ tinPct
  taeConComisionYGastos: number; // %, con comisión + gastos, sin seguros
  taeFinal: number; // %, con todo incluido
  impactoComisionYGastosPct: number; // taeConComisionYGastos - taeSoloTin
  impactoSegurosPct: number; // taeFinal - taeConComisionYGastos
}

function valorPresentePagos(pagoMensual: number, tasaMensual: number, numeroCuotas: number): number {
  if (tasaMensual === 0) return pagoMensual * numeroCuotas;
  return (pagoMensual * (1 - Math.pow(1 + tasaMensual, -numeroCuotas))) / tasaMensual;
}

// Bisección: valorPresentePagos es estrictamente decreciente en tasaMensual,
// así que basta con acotar entre 0 y 1 (100% mensual, cota generosa) e ir
// cerrando el intervalo. 100 iteraciones con tolerancia 1e-9 convergen sobre
// de sobra para cualquier hipoteca real.
function resolverTasaMensualTae(capitalNeto: number, pagoMensual: number, numeroCuotas: number): number {
  let lo = 0;
  let hi = 1;
  for (let iteracion = 0; iteracion < 100; iteracion++) {
    const medio = (lo + hi) / 2;
    const vp = valorPresentePagos(pagoMensual, medio, numeroCuotas);
    if (vp > capitalNeto) {
      lo = medio;
    } else {
      hi = medio;
    }
    if (hi - lo < 1e-9) break;
  }
  return (lo + hi) / 2;
}

function calcularTaePct(
  capital: number,
  cuotaMensual: number,
  numeroCuotas: number,
  comisionAperturaPct: number,
  gastosInicialesFijos: number,
  seguroAnual: number,
): number {
  const capitalNeto = capital - (capital * comisionAperturaPct) / 100 - gastosInicialesFijos;
  const pagoMensual = cuotaMensual + seguroAnual / 12;
  const tasaMensual = resolverTasaMensualTae(capitalNeto, pagoMensual, numeroCuotas);
  return (Math.pow(1 + tasaMensual, 12) - 1) * 100;
}

export function calcularHipotecaTinTae(input: HipotecaTinTaeInput): HipotecaTinTaeResultado {
  const {
    capital,
    tinPct,
    plazoAnios,
    comisionAperturaPct = 0,
    gastosInicialesFijos = 0,
    seguroAnual = 0,
  } = input;

  validarNoNegativo(capital, 'El capital');
  validarNoNegativo(tinPct, 'El TIN');
  if (!Number.isFinite(plazoAnios) || plazoAnios <= 0) {
    throw new Error('El plazo en años debe ser mayor que cero');
  }
  validarNoNegativo(comisionAperturaPct, 'La comisión de apertura');
  validarNoNegativo(gastosInicialesFijos, 'Los gastos iniciales');
  validarNoNegativo(seguroAnual, 'El seguro anual');

  const numeroCuotas = Math.round(plazoAnios * 12);
  const cuotaMensual = amortizacionFrancesa(capital, tinPct, numeroCuotas);
  const costeTotalIntereses = cuotaMensual * numeroCuotas - capital;
  const costeAperturaYGastos = (capital * comisionAperturaPct) / 100 + gastosInicialesFijos;
  const costeSegurosTotal = seguroAnual * plazoAnios;
  const costeTotalPrestamo = costeTotalIntereses + costeAperturaYGastos + costeSegurosTotal;

  const taeSoloTin = calcularTaePct(capital, cuotaMensual, numeroCuotas, 0, 0, 0);
  const taeConComisionYGastos = calcularTaePct(
    capital,
    cuotaMensual,
    numeroCuotas,
    comisionAperturaPct,
    gastosInicialesFijos,
    0,
  );
  const taeFinal = calcularTaePct(
    capital,
    cuotaMensual,
    numeroCuotas,
    comisionAperturaPct,
    gastosInicialesFijos,
    seguroAnual,
  );

  return {
    cuotaMensual,
    costeTotalIntereses,
    costeAperturaYGastos,
    costeSegurosTotal,
    costeTotalPrestamo,
    tinPct,
    taeSoloTin,
    taeConComisionYGastos,
    taeFinal,
    impactoComisionYGastosPct: taeConComisionYGastos - taeSoloTin,
    impactoSegurosPct: taeFinal - taeConComisionYGastos,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 9. Comprar para alquilar — rentabilidad de inversión inmobiliaria
// ─────────────────────────────────────────────────────────────────────────

export interface AlquilerRentabilidadInput {
  precioVivienda: number;
  entradaPct?: number;
  gastosCompraPct?: number;
  tinHipotecaPct: number;
  plazoHipotecaAnios: number;
  alquilerMensual: number;
  ibiAnual?: number;
  comunidadMensual?: number;
  seguroHogarAnual?: number;
  mantenimientoPctAnual?: number;
  gestoriaPctAlquiler?: number;
  tasaVacioPct?: number;
  umbralRentabilidadAceptablePct?: number;
}

export type VeredictoAlquiler = 'Merece la pena' | 'Dudoso' | 'No merece la pena';

export interface AlquilerRentabilidadResultado {
  capitalPrestamo: number;
  cuotaMensualHipoteca: number;
  inversionInicial: number;
  ingresoAlquilerAnualEfectivo: number;
  gastosOperativosAnuales: number;
  noiAnual: number;
  cashflowAnualNeto: number;
  cashflowMensualNeto: number;
  rentabilidadBrutaAnualPct: number;
  rentabilidadNetaSobreInversionPct: number;
  /**
   * ROI sin apalancamiento (como si se pagara al contado, sin hipoteca):
   * ingresoAlquilerAnualEfectivo / (precioVivienda * (1 + gastosCompraPct/100)) * 100.
   * A diferencia de rentabilidadNetaSobreInversionPct, NO resta gastos
   * operativos (IBI, comunidad, seguro, mantenimiento, gestoría) ni cuota de
   * hipoteca — es la renta efectiva (ya descontado el vacío) sobre el coste
   * total de adquisición. Fórmula y magnitud verificadas contra el ejemplo
   * de roiexplorer.com (precio 90.000€, gastos de compra 10%, renta anual
   * efectiva 11.220€ → coste total 99.000€ → ROI 11.33% ≈ su "11.3%").
   */
  roiSinApalancamientoPct: number;
  veredicto: VeredictoAlquiler;
  mensaje: string;
}

export function calcularAlquilerRentabilidad(
  input: AlquilerRentabilidadInput,
): AlquilerRentabilidadResultado {
  const {
    precioVivienda,
    entradaPct = 20,
    gastosCompraPct = 10,
    tinHipotecaPct,
    plazoHipotecaAnios,
    alquilerMensual,
    ibiAnual = 0,
    comunidadMensual = 0,
    seguroHogarAnual = 0,
    mantenimientoPctAnual = 1,
    gestoriaPctAlquiler = 0,
    tasaVacioPct = 5,
    umbralRentabilidadAceptablePct = 5,
  } = input;

  validarNoNegativo(precioVivienda, 'El precio de la vivienda');
  validarNoNegativo(entradaPct, 'El porcentaje de entrada');
  validarNoNegativo(gastosCompraPct, 'Los gastos de compra');
  validarNoNegativo(tinHipotecaPct, 'El TIN de la hipoteca');
  if (!Number.isFinite(plazoHipotecaAnios) || plazoHipotecaAnios <= 0) {
    throw new Error('El plazo de la hipoteca debe ser mayor que cero');
  }
  validarNoNegativo(alquilerMensual, 'El alquiler mensual');
  validarNoNegativo(ibiAnual, 'El IBI anual');
  validarNoNegativo(comunidadMensual, 'La comunidad mensual');
  validarNoNegativo(seguroHogarAnual, 'El seguro de hogar anual');
  validarNoNegativo(mantenimientoPctAnual, 'El porcentaje de mantenimiento');
  validarNoNegativo(gestoriaPctAlquiler, 'El porcentaje de gestoría');
  validarNoNegativo(tasaVacioPct, 'La tasa de vacío');
  validarNoNegativo(umbralRentabilidadAceptablePct, 'El umbral de rentabilidad aceptable');

  const capitalPrestamo = precioVivienda * (1 - entradaPct / 100);
  const numeroCuotas = Math.round(plazoHipotecaAnios * 12);
  const cuotaMensualHipoteca = amortizacionFrancesa(capitalPrestamo, tinHipotecaPct, numeroCuotas);

  const inversionInicial = (precioVivienda * (entradaPct + gastosCompraPct)) / 100;
  const ingresoAlquilerAnualEfectivo = alquilerMensual * 12 * (1 - tasaVacioPct / 100);
  const gastosOperativosAnuales =
    ibiAnual +
    comunidadMensual * 12 +
    seguroHogarAnual +
    (precioVivienda * mantenimientoPctAnual) / 100 +
    (ingresoAlquilerAnualEfectivo * gestoriaPctAlquiler) / 100;

  const noiAnual = ingresoAlquilerAnualEfectivo - gastosOperativosAnuales;
  const cashflowAnualNeto = noiAnual - cuotaMensualHipoteca * 12;
  const cashflowMensualNeto = cashflowAnualNeto / 12;
  const rentabilidadBrutaAnualPct = (ingresoAlquilerAnualEfectivo / precioVivienda) * 100;
  const rentabilidadNetaSobreInversionPct =
    inversionInicial > 0 ? (cashflowAnualNeto / inversionInicial) * 100 : 0;
  const costeTotalDeCompra = precioVivienda * (1 + gastosCompraPct / 100);
  const roiSinApalancamientoPct =
    costeTotalDeCompra > 0 ? (ingresoAlquilerAnualEfectivo / costeTotalDeCompra) * 100 : 0;

  let veredicto: VeredictoAlquiler;
  let mensaje: string;
  if (cashflowAnualNeto <= 0) {
    veredicto = 'No merece la pena';
    mensaje = 'El alquiler no cubre todos los gastos (incluida la hipoteca): pierdes dinero cada mes.';
  } else if (rentabilidadNetaSobreInversionPct >= umbralRentabilidadAceptablePct) {
    veredicto = 'Merece la pena';
    mensaje = 'El cashflow es positivo y la rentabilidad sobre lo invertido supera el umbral marcado.';
  } else {
    veredicto = 'Dudoso';
    mensaje =
      'El cashflow es positivo pero la rentabilidad es baja para el riesgo y esfuerzo de gestionar un alquiler — compara con alternativas más pasivas.';
  }

  return {
    capitalPrestamo,
    cuotaMensualHipoteca,
    inversionInicial,
    ingresoAlquilerAnualEfectivo,
    gastosOperativosAnuales,
    noiAnual,
    cashflowAnualNeto,
    cashflowMensualNeto,
    rentabilidadBrutaAnualPct,
    rentabilidadNetaSobreInversionPct,
    roiSinApalancamientoPct,
    veredicto,
    mensaje,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 9b. Comprar para alquilar — proyección año a año hasta pagar la hipoteca
// ─────────────────────────────────────────────────────────────────────────
//
// Escenario deliberadamente conservador: alquiler y precio de la vivienda
// constantes durante toda la proyección (sin revalorización ni subida de
// alquiler). Todo el retorno viene de dos sitios: el capital de la hipoteca
// que se va amortizando (equity, "ahorro forzoso") y el cashflow acumulado
// (que es el mismo cada año en calcularAlquilerRentabilidad, ya que no hay
// inflación de rentas ni de gastos en este modelo). Reutiliza
// calcularAlquilerRentabilidad para no duplicar esa lógica.

export interface AñoProyeccionAlquiler {
  año: number;
  saldoPendienteHipoteca: number; // al final de ese año
  capitalAmortizadoAño: number; // saldoPendiente(k-1) - saldoPendiente(k)
  interesesAño: number; // cuotaMensualHipoteca*12 - capitalAmortizadoAño
  cashflowAnualNeto: number; // igual cada año en este escenario conservador
  patrimonioNetoAcumulado: number; // precioVivienda - saldoPendienteHipoteca
  cashflowAcumulado: number; // suma de cashflowAnualNeto desde el año 1 hasta este, inclusive
  retornoTotalAcumulado: number; // (capitalPrestamo - saldoPendienteHipoteca) + cashflowAcumulado
  retornoTotalSobreInversionPct: number; // retornoTotalAcumulado / inversionInicial * 100
}

export interface ProyeccionAlquilerResultado {
  años: AñoProyeccionAlquiler[];
  cashflowAnualTrasHipoteca: number; // = noiAnual, sin cuota, una vez pagada la hipoteca
  cashflowMensualTrasHipoteca: number; // cashflowAnualTrasHipoteca / 12
  patrimonioNetoFinal: number; // = precioVivienda (deuda ya a 0)
  // ACUMULADO a lo largo de TODO el plazo de la hipoteca (no es una tasa
  // anual) — por eso sale mucho más alto que "rentabilidad neta sobre
  // inversión" de calcularAlquilerRentabilidad, que sí es anual. No son la
  // misma magnitud y no deben compararse directamente entre sí.
  retornoTotalFinalSobreInversionPct: number;
  // Versión anualizada (tasa compuesta equivalente, tipo CAGR) del retorno
  // total acumulado, para que SÍ sea comparable con una rentabilidad anual.
  retornoTotalAnualizadoPct: number;
}

// Saldo pendiente de la hipoteca tras k años completos (k*12 cuotas pagadas
// de un total de n = plazoHipotecaAnios*12), amortización francesa estándar.
// Caso borde TIN 0%: amortización lineal.
function saldoPendienteHipotecaTrasAnios(
  capitalPrestamo: number,
  tinHipotecaPct: number,
  plazoHipotecaAnios: number,
  k: number,
): number {
  const n = Math.round(plazoHipotecaAnios * 12);
  const cuotasPagadas = k * 12;

  if (k <= 0) return capitalPrestamo;
  if (k >= plazoHipotecaAnios) return 0;

  const r = tinHipotecaPct / 100 / 12;
  if (r === 0) {
    return capitalPrestamo * (1 - cuotasPagadas / n);
  }

  const factorTotal = Math.pow(1 + r, n);
  const factorPagado = Math.pow(1 + r, cuotasPagadas);
  return (capitalPrestamo * (factorTotal - factorPagado)) / (factorTotal - 1);
}

export function simularProyeccionAlquiler(
  input: AlquilerRentabilidadInput,
): ProyeccionAlquilerResultado {
  const base = calcularAlquilerRentabilidad(input);
  const { precioVivienda, tinHipotecaPct, plazoHipotecaAnios } = input;
  const { capitalPrestamo, cuotaMensualHipoteca, cashflowAnualNeto, inversionInicial, noiAnual } = base;

  const añosTotales = Math.round(plazoHipotecaAnios);
  const años: AñoProyeccionAlquiler[] = [];

  let saldoAnterior = capitalPrestamo;
  let cashflowAcumulado = 0;

  for (let k = 1; k <= añosTotales; k++) {
    const esUltimoAño = k === añosTotales;
    const saldoPendienteHipoteca = esUltimoAño
      ? 0
      : saldoPendienteHipotecaTrasAnios(capitalPrestamo, tinHipotecaPct, plazoHipotecaAnios, k);

    const capitalAmortizadoAño = saldoAnterior - saldoPendienteHipoteca;
    const interesesAño = cuotaMensualHipoteca * 12 - capitalAmortizadoAño;

    cashflowAcumulado += cashflowAnualNeto;

    const patrimonioNetoAcumulado = precioVivienda - saldoPendienteHipoteca;
    const retornoTotalAcumulado = capitalPrestamo - saldoPendienteHipoteca + cashflowAcumulado;
    const retornoTotalSobreInversionPct =
      inversionInicial > 0 ? (retornoTotalAcumulado / inversionInicial) * 100 : 0;

    años.push({
      año: k,
      saldoPendienteHipoteca,
      capitalAmortizadoAño,
      interesesAño,
      cashflowAnualNeto,
      patrimonioNetoAcumulado,
      cashflowAcumulado,
      retornoTotalAcumulado,
      retornoTotalSobreInversionPct,
    });

    saldoAnterior = saldoPendienteHipoteca;
  }

  const ultimoAño = años[años.length - 1];
  const retornoTotalFinalSobreInversionPct = ultimoAño ? ultimoAño.retornoTotalSobreInversionPct : 0;

  // Anualizar el retorno acumulado (tipo CAGR): qué tasa anual constante,
  // compuesta durante añosTotales años, habría producido el mismo múltiplo
  // final sobre la inversión inicial. Así sí es comparable con una
  // rentabilidad anual como "rentabilidad neta sobre inversión".
  const multiploFinal = 1 + retornoTotalFinalSobreInversionPct / 100;
  const retornoTotalAnualizadoPct =
    multiploFinal > 0 && añosTotales > 0
      ? (Math.pow(multiploFinal, 1 / añosTotales) - 1) * 100
      : 0;

  return {
    años,
    cashflowAnualTrasHipoteca: noiAnual,
    cashflowMensualTrasHipoteca: noiAnual / 12,
    patrimonioNetoFinal: precioVivienda,
    retornoTotalFinalSobreInversionPct,
    retornoTotalAnualizadoPct,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 9c. Flip (comprar, reformar, vender) — inspirado en roiexplorer.com
// ─────────────────────────────────────────────────────────────────────────
//
// A diferencia de "Comprar para alquilar", un flip no genera renta: el
// retorno es puramente el margen entre lo invertido (compra + gastos +
// reforma) y lo obtenido en la venta (ya descontados los gastos de venta).
// Por eso, deliberadamente, esta función NO recibe ni usa tinHipotecaPct ni
// plazoHipotecaAnios — no hay hipoteca ni cuota que amortizar en este
// modelo, es una operación de compraventa pura. `precioVentaEstimado` se
// recibe ya calculado por quien llama (típicamente `medianaVentaM2 *
// metros`, el mismo AVM que ya usa "Rentabilidad de alquiler por zona"):
// esta función no sabe nada de comparables ni de scraping, solo hace
// aritmética con los números que le dan.

export interface FlipInput {
  precioCompra: number;
  /** % sobre el precio de compra (ITP/IVA, notaría, registro, gestoría…). Default 10, igual que en "Comprar para alquilar". */
  gastosCompraPct?: number;
  /** Coste de la reforma, en euros. Default 0 — mismo concepto per-listing que "Gastos de reforma" en el modo alquiler. */
  gastosReforma?: number;
  /** Estimación de precio de venta ya calculada por quien llama (p. ej. medianaVentaM2 * metros). */
  precioVentaEstimado: number;
  /** % sobre el precio de venta (comisión de la inmobiliaria + gastos de cierre). Default 5, rango típico en España 3-6%. */
  gastosVentaPct?: number;
  /**
   * Umbral de margen para "Merece la pena", en %. Default 20 — más alto que
   * el umbral de rentabilidad de alquiler (5%) porque un flip no genera
   * cashflow mientras dura la obra/venta (meses sin ingreso, capital
   * inmovilizado), tiene más riesgo de ejecución (sobrecoste de reforma,
   * plazos de venta que se alargan) y es una operación ilíquida de una sola
   * vez, no una renta recurrente — necesita más colchón para compensar.
   */
  umbralMargenAceptablePct?: number;
}

export type VeredictoFlip = VeredictoAlquiler;

export interface FlipResultado {
  /** precioCompra * (1 + gastosCompraPct/100) + gastosReforma */
  inversionTotal: number;
  /** precioVentaEstimado * (1 - gastosVentaPct/100) */
  ingresoVentaNeto: number;
  /** ingresoVentaNeto - inversionTotal */
  beneficioBruto: number;
  /** beneficioBruto / inversionTotal * 100 */
  margenSobreInversionPct: number;
  veredicto: VeredictoFlip;
  mensaje: string;
}

export function calcularFlip(input: FlipInput): FlipResultado {
  const {
    precioCompra,
    gastosCompraPct = 10,
    gastosReforma = 0,
    precioVentaEstimado,
    gastosVentaPct = 5,
    umbralMargenAceptablePct = 20,
  } = input;

  validarNoNegativo(precioCompra, 'El precio de compra');
  validarNoNegativo(gastosCompraPct, 'Los gastos de compra');
  validarNoNegativo(gastosReforma, 'Los gastos de reforma');
  validarNoNegativo(precioVentaEstimado, 'El precio de venta estimado');
  validarNoNegativo(gastosVentaPct, 'Los gastos de venta');
  validarNoNegativo(umbralMargenAceptablePct, 'El umbral de margen aceptable');

  const inversionTotal = precioCompra * (1 + gastosCompraPct / 100) + gastosReforma;
  const ingresoVentaNeto = precioVentaEstimado * (1 - gastosVentaPct / 100);
  const beneficioBruto = ingresoVentaNeto - inversionTotal;
  const margenSobreInversionPct = inversionTotal > 0 ? (beneficioBruto / inversionTotal) * 100 : 0;

  let veredicto: VeredictoFlip;
  let mensaje: string;
  if (beneficioBruto <= 0) {
    veredicto = 'No merece la pena';
    mensaje = 'El precio de venta estimado no cubre la compra, la reforma y los gastos: pierdes dinero en la operación.';
  } else if (margenSobreInversionPct >= umbralMargenAceptablePct) {
    veredicto = 'Merece la pena';
    mensaje = 'El margen sobre lo invertido supera el umbral marcado, suficiente para compensar el riesgo y el tiempo sin renta de un flip.';
  } else {
    veredicto = 'Dudoso';
    mensaje =
      'Hay beneficio pero el margen es bajo para el riesgo (sobrecoste de reforma, plazo de venta) de una operación de compraventa — compara con alternativas más seguras.';
  }

  return {
    inversionTotal,
    ingresoVentaNeto,
    beneficioBruto,
    margenSobreInversionPct,
    veredicto,
    mensaje,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 10. Pérdida de poder adquisitivo por inflación (dinero parado, sin invertir)
// ─────────────────────────────────────────────────────────────────────────

export interface PerdidaPoderAdquisitivoInput {
  capitalInicial: number;
  inflacionAnualPct: number;
  anios: number;
}

export interface PerdidaPoderAdquisitivoResultado {
  valorRealFuturo: number; // poder de compra del capital dentro de `anios`, en euros de hoy
  perdidaPoderAdquisitivo: number; // capitalInicial - valorRealFuturo
  perdidaPorcentual: number; // % del capital que se pierde en poder de compra
  nominalNecesarioParaIgualarHoy: number; // lo que haría falta tener entonces, en euros nominales, para comprar lo mismo que hoy
}

export function calcularPerdidaPoderAdquisitivo(
  input: PerdidaPoderAdquisitivoInput,
): PerdidaPoderAdquisitivoResultado {
  const { capitalInicial, inflacionAnualPct, anios } = input;

  validarNoNegativo(capitalInicial, 'El capital inicial');
  validarNoNegativo(inflacionAnualPct, 'La inflación anual');
  if (!Number.isFinite(anios) || anios <= 0) {
    throw new Error('Los años deben ser mayor que cero');
  }

  const factor = Math.pow(1 + inflacionAnualPct / 100, anios);
  const valorRealFuturo = capitalInicial / factor;
  const perdidaPoderAdquisitivo = capitalInicial - valorRealFuturo;
  const perdidaPorcentual = capitalInicial > 0 ? (perdidaPoderAdquisitivo / capitalInicial) * 100 : 0;
  const nominalNecesarioParaIgualarHoy = capitalInicial * factor;

  return {
    valorRealFuturo,
    perdidaPoderAdquisitivo,
    perdidaPorcentual,
    nominalNecesarioParaIgualarHoy,
  };
}
