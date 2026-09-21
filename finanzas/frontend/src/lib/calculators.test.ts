import { describe, it, expect } from 'vitest';
import {
  calcularInteresCompuesto,
  calcularPrestamoMaximo,
  calcularAhorroNecesario,
  calcularCuotaMaximaHipoteca,
  calcularPrecioMaximoVivienda,
  calcularColchonSeguridad,
  calcularDeuda,
  calcularImpuestoProgresivoAhorro,
  simularInteresCompuestoAvanzado,
  generarAñosCrisisAleatorios,
  calcularHipotecaTinTae,
  calcularAlquilerRentabilidad,
  simularProyeccionAlquiler,
  calcularPerdidaPoderAdquisitivo,
} from './calculators';

describe('calcularInteresCompuesto', () => {
  it('capitaliza el principal sin aportaciones (1000€ al 5% anual, 10 años, capitalización anual)', () => {
    const resultado = calcularInteresCompuesto({
      capitalInicial: 1000,
      tasaAnualPct: 5,
      anios: 10,
      frecuenciaCapitalizacion: 'anual',
    });
    // 1000 * (1.05)^10 ≈ 1628.89
    expect(resultado.capitalFinal).toBeCloseTo(1628.89, 1);
    expect(resultado.totalAportado).toBe(0);
    expect(resultado.totalIntereses).toBeCloseTo(628.89, 1);
  });

  it('suma las aportaciones periódicas compuestas al capital final', () => {
    const resultado = calcularInteresCompuesto({
      capitalInicial: 1000,
      tasaAnualPct: 5,
      anios: 10,
      frecuenciaCapitalizacion: 'anual',
      aportacionPeriodica: 100,
      frecuenciaAportacion: 'anual',
    });
    expect(resultado.totalAportado).toBeCloseTo(1000, 5); // 100 * 10
    expect(resultado.capitalFinal).toBeGreaterThan(resultado.totalAportado + 1000);
  });

  it('rechaza un capital inicial negativo', () => {
    expect(() =>
      calcularInteresCompuesto({
        capitalInicial: -1,
        tasaAnualPct: 5,
        anios: 10,
        frecuenciaCapitalizacion: 'anual',
      }),
    ).toThrow();
  });
});

describe('calcularPrestamoMaximo (regla del ×4)', () => {
  it('con un salario neto de 2000€/mes da un préstamo máximo de 96000€', () => {
    expect(calcularPrestamoMaximo(2000)).toBeCloseTo(96000, 5);
  });

  it('rechaza un salario negativo', () => {
    expect(() => calcularPrestamoMaximo(-100)).toThrow();
  });
});

describe('calcularAhorroNecesario', () => {
  it('con una vivienda de 200000€ exige un ahorro de 60000€ (20% + 10%)', () => {
    const resultado = calcularAhorroNecesario(200000);
    expect(resultado.ahorroNecesario).toBeCloseTo(60000, 5);
    expect(resultado.entrada).toBeCloseTo(40000, 5);
    expect(resultado.gastos).toBeCloseTo(20000, 5);
  });
});

describe('calcularCuotaMaximaHipoteca ("llave de la cuota")', () => {
  it('con un sueldo neto de 2000€/mes da una cuota máxima de 700€', () => {
    expect(calcularCuotaMaximaHipoteca(2000)).toBeCloseTo(700, 5);
  });
});

describe('calcularPrecioMaximoVivienda ("llave del ahorro")', () => {
  it('con 30000€ ahorrados da un precio máximo de vivienda de 100000€', () => {
    expect(calcularPrecioMaximoVivienda(30000)).toBeCloseTo(100000, 5);
  });
});

describe('calcularColchonSeguridad ("llave del colchón")', () => {
  it('exige 3 meses de gastos fijos como colchón mínimo', () => {
    const resultado = calcularColchonSeguridad(800);
    expect(resultado.colchonMinimo).toBeCloseTo(2400, 5);
    expect(resultado.suficiente).toBeUndefined();
  });

  it('marca el ahorro restante como suficiente cuando cubre el colchón', () => {
    const resultado = calcularColchonSeguridad(800, 3000);
    expect(resultado.suficiente).toBe(true);
  });

  it('marca el ahorro restante como insuficiente cuando no llega al colchón', () => {
    const resultado = calcularColchonSeguridad(800, 1000);
    expect(resultado.suficiente).toBe(false);
  });
});

describe('calcularDeuda (comparador deuda buena vs. deuda mala)', () => {
  it('calcula la cuota francesa de 5000€ al 6% a 4 años (≈117€/mes, ≈5616€ de coste total)', () => {
    const resultado = calcularDeuda({ capital: 5000, tasaAnualPct: 6, plazoAnios: 4 });
    expect(resultado.cuotaMensual).toBeGreaterThan(110);
    expect(resultado.cuotaMensual).toBeLessThan(125);
    expect(resultado.costeTotal).toBeGreaterThan(5550);
    expect(resultado.costeTotal).toBeLessThan(5700);
    expect(resultado.interesesTotales).toBeCloseTo(resultado.costeTotal - 5000, 5);
    expect(resultado.fondoReservaRecomendado).toBeCloseTo(resultado.cuotaMensual * 12, 5);
  });

  it('marca "Deuda buena" cuando el beneficio esperado supera el coste total', () => {
    const resultado = calcularDeuda({
      capital: 5000,
      tasaAnualPct: 6,
      plazoAnios: 4,
      beneficioEsperado: 8000,
    });
    expect(resultado.veredicto).toBe('Deuda buena');
    expect(resultado.beneficioNeto).toBeGreaterThan(0);
  });

  it('marca "Deuda mala" cuando el beneficio esperado no cubre el coste total', () => {
    const resultado = calcularDeuda({
      capital: 5000,
      tasaAnualPct: 6,
      plazoAnios: 4,
      beneficioEsperado: 1000,
    });
    expect(resultado.veredicto).toBe('Deuda mala');
    expect(resultado.beneficioNeto).toBeLessThan(0);
  });

  it('rechaza un plazo de cero años', () => {
    expect(() => calcularDeuda({ capital: 5000, tasaAnualPct: 6, plazoAnios: 0 })).toThrow();
  });
});

describe('calcularImpuestoProgresivoAhorro', () => {
  it('con una base de 60000€ tributa 12680€ (tramos 19/21/23%)', () => {
    expect(calcularImpuestoProgresivoAhorro(60000)).toBeCloseTo(12680, 5);
  });

  it('con una base de 3000€ (dentro del primer tramo) tributa al 19%', () => {
    expect(calcularImpuestoProgresivoAhorro(3000)).toBeCloseTo(570, 5);
  });

  it('con una base de 0€ no tributa nada', () => {
    expect(calcularImpuestoProgresivoAhorro(0)).toBe(0);
  });
});

describe('simularInteresCompuestoAvanzado', () => {
  it('régimen "anual" sin años de crisis: tributa cada año sobre la ganancia de ese año', () => {
    const resultado = simularInteresCompuestoAvanzado({
      capitalInicial: 10000,
      tasaAnualBase: 10,
      años: 1,
      añosCrisis: [],
      regimenFiscal: 'anual',
    });
    expect(resultado.años[0].gananciaDelAño).toBeCloseTo(1000, 5);
    expect(resultado.años[0].impuestoPagado).toBeCloseTo(190, 5); // 1000 * 0.19
    expect(resultado.saldoFinalNeto).toBeCloseTo(10810, 5);
  });

  it('compensa una pérdida de un año contra la ganancia de un año posterior (régimen "anual")', () => {
    const resultado = simularInteresCompuestoAvanzado({
      capitalInicial: 10000,
      tasaAnualBase: 5,
      años: 2,
      añosCrisis: [{ año: 1, rendimiento: -10 }], // -1000€ el año 1 → 0 impuesto
      regimenFiscal: 'anual',
    });
    expect(resultado.años[0].gananciaDelAño).toBeCloseTo(-1000, 5);
    expect(resultado.años[0].impuestoPagado).toBe(0);

    // Año 2: saldo tras la pérdida = 9000, +5% = 450€ de ganancia bruta.
    // Se compensan 450€... para que la ganancia bruta del año 2 sea de 5000€
    // (y así la base compensada quede en 4000€) forzamos el escenario con una
    // tasa base más alta sobre un saldo mayor.
    const resultado2 = simularInteresCompuestoAvanzado({
      capitalInicial: 100000,
      tasaAnualBase: 5,
      años: 2,
      añosCrisis: [{ año: 1, rendimiento: -1 }], // -1000€ el año 1
      regimenFiscal: 'anual',
    });
    expect(resultado2.años[0].gananciaDelAño).toBeCloseTo(-1000, 5);
    // Año 2: saldo tras el año 1 = 99000; ganancia = 99000 * 5% = 4950€.
    // Compensada contra la pérdida de 1000€ → base imponible 3950€.
    const baseCompensada = resultado2.años[1].gananciaDelAño - 1000;
    expect(resultado2.años[1].impuestoPagado).toBeCloseTo(
      calcularImpuestoProgresivoAhorro(baseCompensada),
      5,
    );
    expect(resultado2.años[1].impuestoPagado).toBeLessThan(
      calcularImpuestoProgresivoAhorro(resultado2.años[1].gananciaDelAño),
    );
  });

  it('compensa exactamente 1000€ de pérdida contra una ganancia de 5000€ (base imponible 4000€)', () => {
    // Año 1: capital 10000 al -10% → pérdida exacta de 1000€, impuesto 0.
    // Año 2: sobre el saldo de 9000€ forzamos una ganancia bruta de 5000€
    // usando un año de "crisis" (en realidad una subida) que da justo esa cifra.
    const resultado = simularInteresCompuestoAvanzado({
      capitalInicial: 10000,
      tasaAnualBase: 0,
      años: 2,
      añosCrisis: [
        { año: 1, rendimiento: -10 },
        { año: 2, rendimiento: (5000 / 9000) * 100 },
      ],
      regimenFiscal: 'anual',
    });
    expect(resultado.años[0].impuestoPagado).toBe(0);
    expect(resultado.años[1].gananciaDelAño).toBeCloseTo(5000, 2);
    expect(resultado.años[1].impuestoPagado).toBeCloseTo(
      calcularImpuestoProgresivoAhorro(4000),
      2,
    ); // 760€, no sobre los 5000€ completos
  });

  it('una pérdida caduca a los 4 años y no compensa una ganancia posterior', () => {
    const resultado = simularInteresCompuestoAvanzado({
      capitalInicial: 10000,
      tasaAnualBase: 5,
      años: 6,
      añosCrisis: [{ año: 1, rendimiento: -10 }],
      regimenFiscal: 'anual',
    });
    const añoConGanancia = resultado.años[5]; // año 6, más de 4 años tras el año 1
    expect(añoConGanancia.gananciaDelAño).toBeGreaterThan(0);
    expect(añoConGanancia.impuestoPagado).toBeCloseTo(
      calcularImpuestoProgresivoAhorro(añoConGanancia.gananciaDelAño),
      5,
    ); // tributa la ganancia completa, la pérdida del año 1 ya caducó
  });

  it('régimen "diferido": no tributa en años intermedios, solo al final sobre la ganancia total', () => {
    const resultado = simularInteresCompuestoAvanzado({
      capitalInicial: 10000,
      tasaAnualBase: 7,
      años: 5,
      añosCrisis: [{ año: 3, rendimiento: -30 }],
      regimenFiscal: 'diferido',
    });

    for (let i = 0; i < resultado.años.length - 1; i++) {
      expect(resultado.años[i].impuestoPagado).toBe(0);
    }

    const ultimoAño = resultado.años[resultado.años.length - 1];
    const gananciaTotal = resultado.saldoFinalBruto - resultado.totalAportado;
    expect(ultimoAño.impuestoPagado).toBeCloseTo(calcularImpuestoProgresivoAhorro(gananciaTotal), 5);
    expect(resultado.saldoFinalNeto).toBeCloseTo(resultado.saldoFinalBruto - ultimoAño.impuestoPagado, 5);
  });

  it('régimen "ninguno": el saldo final bruto y neto coinciden y no hay impuestos', () => {
    const resultado = simularInteresCompuestoAvanzado({
      capitalInicial: 10000,
      tasaAnualBase: 7,
      años: 5,
      añosCrisis: [{ año: 3, rendimiento: -30 }],
      regimenFiscal: 'ninguno',
    });
    expect(resultado.saldoFinalBruto).toBeCloseTo(resultado.saldoFinalNeto, 5);
    expect(resultado.impuestosTotales).toBe(0);
  });

  it('un año de crisis sustituye la tasa base (7% base, -30% el año 3)', () => {
    const resultado = simularInteresCompuestoAvanzado({
      capitalInicial: 10000,
      tasaAnualBase: 7,
      años: 5,
      añosCrisis: [{ año: 3, rendimiento: -30 }],
      regimenFiscal: 'ninguno',
    });
    expect(resultado.años[2].rendimientoAplicado).toBe(-30);
    expect(resultado.años[2].gananciaDelAño).toBeLessThan(0);
    expect(resultado.años[2].saldoFinBruto).toBeLessThan(resultado.años[2].saldoInicio);
    // Los demás años usan la tasa base normal (7%, positiva)
    expect(resultado.años[0].rendimientoAplicado).toBe(7);
    expect(resultado.años[0].gananciaDelAño).toBeGreaterThan(0);
  });

  describe('régimen "retiros_fifo"', () => {
    it('un solo lote, retiro parcial: consume 5000€ de un lote de 11000€ con FIFO', () => {
      const resultado = simularInteresCompuestoAvanzado({
        capitalInicial: 10000,
        tasaAnualBase: 10,
        años: 1,
        añosCrisis: [],
        regimenFiscal: 'retiros_fifo',
        retiroAnual: 5000,
        añoInicioRetiros: 1,
      });

      const año1 = resultado.años[0];
      // Rendimiento: 10000 * 1.10 = 11000. Retiro de 5000: fracción = 5000/11000,
      // coste consumido = 10000 * (5000/11000) ≈ 4545.4545, ganancia ≈ 454.5454.
      const gananciaEsperada = 5000 - 10000 * (5000 / 11000);
      const impuestoEsperado = calcularImpuestoProgresivoAhorro(gananciaEsperada); // 19% (1er tramo)

      expect(año1.retiroBruto).toBeCloseTo(5000, 2);
      expect(año1.impuestoPagado).toBeCloseTo(impuestoEsperado, 2);
      expect(impuestoEsperado).toBeCloseTo(86.3636, 2);
      expect(año1.retiroNeto).toBeCloseTo(5000 - impuestoEsperado, 2);
      expect(año1.retiroNeto).toBeCloseTo(4913.64, 1);
      // Saldo del fondo restante tras el retiro: 11000 - 5000 = 6000 exacto.
      expect(año1.saldoFinNeto).toBeCloseTo(6000, 5);
      expect(resultado.saldoFinalFondoRestante).toBeCloseTo(6000, 5);
    });

    it('dos años, dos lotes: el retiro consume primero el lote más antiguo (FIFO, no LIFO ni proporcional)', () => {
      const resultado = simularInteresCompuestoAvanzado({
        capitalInicial: 10000,
        tasaAnualBase: 10,
        años: 2,
        aportacionAnual: 1000,
        añosCrisis: [],
        regimenFiscal: 'retiros_fifo',
        retiroAnual: 13000,
        añoInicioRetiros: 2,
      });

      const año2 = resultado.años[1];
      // lote0 (10000→11000→12100, coste 10000) se consume ENTERO primero:
      // ganancia0 = 12100 - 10000 = 2100. Quedan 900€ por retirar del lote1
      // (1000→1100→1210, coste 1000): fracción = 900/1210, ganancia1 = 900 -
      // 1000*(900/1210) ≈ 156.1983. El lote2 (1000→1100, coste 1000, del año 2)
      // no se toca en absoluto.
      const gananciaEsperada = 2100 + (900 - 1000 * (900 / 1210));
      const impuestoEsperado = calcularImpuestoProgresivoAhorro(gananciaEsperada);

      expect(gananciaEsperada).toBeCloseTo(2256.1983, 3);
      expect(año2.retiroBruto).toBeCloseTo(13000, 2);
      expect(año2.impuestoPagado).toBeCloseTo(impuestoEsperado, 2);
      expect(impuestoEsperado).toBeCloseTo(428.6777, 2);
      expect(año2.retiroNeto).toBeCloseTo(13000 - impuestoEsperado, 2);
      expect(año2.retiroNeto).toBeCloseTo(12571.32, 1);

      // Fondo restante: (lote1: 1210-900=310) + (lote2 intacto: 1100) = 1410.
      // Si el orden hubiera sido LIFO o proporcional, la ganancia realizada
      // (y por tanto el impuesto) habría salido distinta — esta es la prueba
      // real de que el orden es FIFO, ya que el fondo restante total no
      // depende del orden de consumo (solo la base imponible sí).
      expect(resultado.saldoFinalFondoRestante).toBeCloseTo(1410, 2);

      // LIFO habría dado una ganancia distinta (consumiría lote2 y lote1
      // enteros y una fracción de lote0, con más coste proporcional): lo
      // comprobamos para dejar constancia de que el resultado NO coincide
      // con ese orden alternativo.
      const gananciaSiFueraLifo = 100 + 210 + (10690 - 10000 * (10690 / 12100));
      expect(gananciaEsperada).not.toBeCloseTo(gananciaSiFueraLifo, 1);
    });

    it('rechaza un año de inicio de retiros fuera de [1, años]', () => {
      expect(() =>
        simularInteresCompuestoAvanzado({
          capitalInicial: 10000,
          tasaAnualBase: 5,
          años: 3,
          añosCrisis: [],
          regimenFiscal: 'retiros_fifo',
          retiroAnual: 1000,
          añoInicioRetiros: 4,
        }),
      ).toThrow();
    });
  });
});

describe('generarAñosCrisisAleatorios', () => {
  it('genera exactamente los años y magnitudes esperados con un rng de secuencia fija', () => {
    // Secuencia consumida en orden: año1 -> [0.3 (< 0.5, hay crisis), 0.5 (magnitud)]
    // año2 -> [0.6 (>= 0.5, sin crisis)]
    // año3 -> [0.1 (< 0.5, hay crisis), 0.9 (magnitud)]
    const secuencia = [0.3, 0.5, 0.6, 0.1, 0.9];
    let i = 0;
    const rng = () => secuencia[i++];

    const resultado = generarAñosCrisisAleatorios(3, 50, 20, rng);

    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toEqual({ año: 1, rendimiento: -20 }); // 20 * (0.5 + 0.5)
    expect(resultado[1]).toEqual({ año: 3, rendimiento: -28 }); // 20 * (0.5 + 0.9)
  });

  it('sin probabilidad de crisis (0%) no genera ningún año', () => {
    const resultado = generarAñosCrisisAleatorios(10, 0, 30, () => 0);
    expect(resultado).toHaveLength(0);
  });
});

describe('calcularHipotecaTinTae', () => {
  const base = { capital: 200000, tinPct: 3, plazoAnios: 25 };

  it('sin comisión, gastos ni seguros, la TAE coincide esencialmente con el TIN', () => {
    const r = calcularHipotecaTinTae({ ...base, comisionAperturaPct: 0, gastosInicialesFijos: 0, seguroAnual: 0 });
    expect(Math.abs(r.taeFinal - r.tinPct)).toBeLessThan(0.05);
    expect(Math.abs(r.taeSoloTin - r.tinPct)).toBeLessThan(0.05);
  });

  it('con comisión de apertura, la TAE es estrictamente mayor que el TIN', () => {
    const r = calcularHipotecaTinTae({ ...base, comisionAperturaPct: 1, gastosInicialesFijos: 0, seguroAnual: 0 });
    expect(r.taeFinal).toBeGreaterThan(r.tinPct);
  });

  it('aumentar la comisión de apertura aumenta la TAE (monotonía)', () => {
    const r1 = calcularHipotecaTinTae({ ...base, comisionAperturaPct: 1, gastosInicialesFijos: 0, seguroAnual: 0 });
    const r2 = calcularHipotecaTinTae({ ...base, comisionAperturaPct: 2, gastosInicialesFijos: 0, seguroAnual: 0 });
    expect(r2.taeFinal).toBeGreaterThan(r1.taeFinal);
  });

  it('añadir un seguro vinculado a un escenario con comisión sube la TAE todavía más', () => {
    const sinSeguro = calcularHipotecaTinTae({
      ...base,
      comisionAperturaPct: 1,
      gastosInicialesFijos: 500,
      seguroAnual: 0,
    });
    const conSeguro = calcularHipotecaTinTae({
      ...base,
      comisionAperturaPct: 1,
      gastosInicialesFijos: 500,
      seguroAnual: 300,
    });
    expect(conSeguro.taeFinal).toBeGreaterThan(sinSeguro.taeFinal);
  });

  it('el desglose de impacto siempre es >= 0 cuando hay esos costes', () => {
    const r = calcularHipotecaTinTae({
      ...base,
      comisionAperturaPct: 1.5,
      gastosInicialesFijos: 800,
      seguroAnual: 250,
    });
    expect(r.impactoComisionYGastosPct).toBeGreaterThanOrEqual(0);
    expect(r.impactoSegurosPct).toBeGreaterThanOrEqual(0);
  });
});

describe('calcularAlquilerRentabilidad', () => {
  it('caso claramente rentable ("Merece la pena")', () => {
    // capitalPrestamo = 80000; cuotaMensual (TIN 0%, 240 cuotas) = 80000/240 = 333.33...
    // inversionInicial = 100000 * 30/100 = 30000
    // ingresoAlquilerAnualEfectivo = 1000*12 (sin vacío) = 12000
    // gastosOperativosAnuales = mantenimiento 1% (default) de 100000 = 1000
    // noiAnual = 12000 - 1000 = 11000
    // cashflowAnualNeto = 11000 - 333.33*12 = 11000 - 4000 = 7000
    // rentabilidadNetaSobreInversionPct = 7000/30000*100 ≈ 23.33% (>= umbral 5%)
    const r = calcularAlquilerRentabilidad({
      precioVivienda: 100000,
      entradaPct: 20,
      gastosCompraPct: 10,
      tinHipotecaPct: 0,
      plazoHipotecaAnios: 20,
      alquilerMensual: 1000,
      tasaVacioPct: 0,
    });

    expect(r.capitalPrestamo).toBeCloseTo(80000, 5);
    expect(r.cuotaMensualHipoteca).toBeCloseTo(333.33, 1);
    expect(r.inversionInicial).toBeCloseTo(30000, 5);
    expect(r.gastosOperativosAnuales).toBeCloseTo(1000, 2);
    expect(r.noiAnual).toBeCloseTo(11000, 2);
    expect(r.cashflowAnualNeto).toBeCloseTo(7000, 1);
    expect(r.rentabilidadNetaSobreInversionPct).toBeCloseTo(23.33, 1);
    expect(r.veredicto).toBe('Merece la pena');
  });

  it('caso con cashflow negativo ("No merece la pena")', () => {
    // capitalPrestamo = 80000; cuotaMensual (TIN 0%, 120 cuotas) = 80000/120 = 666.67
    // ingresoAlquilerAnualEfectivo = 500*12 = 6000; gastos = mantenimiento 1000; noiAnual = 5000
    // cashflowAnualNeto = 5000 - 666.67*12 = 5000 - 8000 = -3000
    const r = calcularAlquilerRentabilidad({
      precioVivienda: 100000,
      entradaPct: 20,
      gastosCompraPct: 10,
      tinHipotecaPct: 0,
      plazoHipotecaAnios: 10,
      alquilerMensual: 500,
      tasaVacioPct: 0,
    });

    expect(r.cuotaMensualHipoteca).toBeCloseTo(666.67, 1);
    expect(r.noiAnual).toBeCloseTo(5000, 2);
    expect(r.cashflowAnualNeto).toBeCloseTo(-3000, 1);
    expect(r.veredicto).toBe('No merece la pena');
  });

  it('caso con cashflow positivo pero rentabilidad baja ("Dudoso")', () => {
    // capitalPrestamo = 80000; cuotaMensual (TIN 0%, 240 cuotas) = 333.33 -> 4000€/año
    // ingresoAlquilerAnualEfectivo = 500*12 = 6000; gastos = mantenimiento 1000; noiAnual = 5000
    // cashflowAnualNeto = 5000 - 4000 = 1000; inversionInicial = 30000
    // rentabilidadNetaSobreInversionPct = 1000/30000*100 ≈ 3.33% (< umbral 5%)
    const r = calcularAlquilerRentabilidad({
      precioVivienda: 100000,
      entradaPct: 20,
      gastosCompraPct: 10,
      tinHipotecaPct: 0,
      plazoHipotecaAnios: 20,
      alquilerMensual: 500,
      tasaVacioPct: 0,
    });

    expect(r.cashflowAnualNeto).toBeCloseTo(1000, 1);
    expect(r.rentabilidadNetaSobreInversionPct).toBeCloseTo(3.33, 1);
    expect(r.veredicto).toBe('Dudoso');
  });

  it('roiSinApalancamientoPct reproduce el ejemplo publicado de roiexplorer.com', () => {
    // roiexplorer.com: precio 90.000€, gastos de compra 10% (coste total
    // 99.000€), renta anual EFECTIVA (ya descontado el vacío) de 11.220€ ->
    // ROI sin apalancamiento = 11.220 / 99.000 * 100 = 11.333...% ≈ su "11.3%".
    // alquilerMensual*12*(1-tasaVacioPct/100) debe dar 11.220€: con vacío 0%,
    // alquilerMensual = 11220/12 = 935€/mes.
    const r = calcularAlquilerRentabilidad({
      precioVivienda: 90000,
      gastosCompraPct: 10,
      tinHipotecaPct: 3,
      plazoHipotecaAnios: 25,
      alquilerMensual: 935,
      tasaVacioPct: 0,
    });

    expect(r.ingresoAlquilerAnualEfectivo).toBeCloseTo(11220, 2);
    expect(r.roiSinApalancamientoPct).toBeCloseTo(11.33, 2);
  });

  it('roiSinApalancamientoPct sigue la fórmula ingresoAlquilerAnualEfectivo / costeTotalDeCompra, sin restar gastos operativos', () => {
    const casos = [
      { precioVivienda: 150000, gastosCompraPct: 10, alquilerMensual: 750, tasaVacioPct: 5 },
      { precioVivienda: 200000, gastosCompraPct: 8, alquilerMensual: 1100, tasaVacioPct: 0 },
    ];

    for (const caso of casos) {
      const r = calcularAlquilerRentabilidad({
        ...caso,
        tinHipotecaPct: 3,
        plazoHipotecaAnios: 25,
      });
      const costeTotalDeCompra = caso.precioVivienda * (1 + caso.gastosCompraPct / 100);
      const esperado = (r.ingresoAlquilerAnualEfectivo / costeTotalDeCompra) * 100;
      expect(r.roiSinApalancamientoPct).toBeCloseTo(esperado, 8);
    }
  });
});

describe('simularProyeccionAlquiler', () => {
  it('caso TIN 0% (amortización lineal, verificable a mano)', () => {
    const input = {
      precioVivienda: 150000,
      entradaPct: 20,
      gastosCompraPct: 10,
      tinHipotecaPct: 0,
      plazoHipotecaAnios: 10,
      alquilerMensual: 750,
      mantenimientoPctAnual: 0,
      tasaVacioPct: 0,
    };
    const base = calcularAlquilerRentabilidad(input);
    const resultado = simularProyeccionAlquiler(input);

    // capitalPrestamo = 150000*0.8 = 120000; cuotaMensual = 120000/120 = 1000€/mes,
    // todo capital (TIN=0, sin intereses) -> 12000€/año amortizado.
    expect(base.capitalPrestamo).toBeCloseTo(120000, 5);
    expect(base.cuotaMensualHipoteca).toBeCloseTo(1000, 5);

    expect(resultado.años).toHaveLength(10);

    const año3 = resultado.años[2];
    expect(año3.saldoPendienteHipoteca).toBeCloseTo(120000 - 3 * 12000, 5); // 84000
    expect(año3.capitalAmortizadoAño).toBeCloseTo(12000, 5);
    expect(año3.interesesAño).toBeCloseTo(0, 5);

    const añoFinal = resultado.años[9];
    expect(añoFinal.saldoPendienteHipoteca).toBe(0);
    expect(resultado.patrimonioNetoFinal).toBeCloseTo(150000, 5);
    expect(resultado.cashflowAnualTrasHipoteca).toBeCloseTo(base.noiAnual, 5);
    expect(resultado.cashflowMensualTrasHipoteca).toBeCloseTo(base.noiAnual / 12, 5);

    // Retorno acumulado en los 10 años: capital amortizado (120000) +
    // cashflow acumulado (cashflowAnualNeto = 9000-12000 = -3000/año * 10 =
    // -30000) = 90000, sobre una inversión inicial de 45000 -> 200%.
    expect(resultado.retornoTotalFinalSobreInversionPct).toBeCloseTo(200, 2);
    // Anualizado (CAGR): (1+2)^(1/10) - 1 ≈ 11.61%/año — mucho más bajo que
    // el 200% acumulado, y es la cifra comparable con una rentabilidad anual.
    expect(resultado.retornoTotalAnualizadoPct).toBeCloseTo(11.61, 1);
  });

  it('caso general con TIN>0% (valores por defecto de la calculadora): invariantes', () => {
    const input = {
      precioVivienda: 150000,
      entradaPct: 20,
      gastosCompraPct: 10,
      tinHipotecaPct: 3,
      plazoHipotecaAnios: 25,
      alquilerMensual: 750,
      ibiAnual: 300,
      comunidadMensual: 40,
      seguroHogarAnual: 150,
      mantenimientoPctAnual: 1,
      gestoriaPctAlquiler: 0,
      tasaVacioPct: 5,
    };
    const base = calcularAlquilerRentabilidad(input);
    const resultado = simularProyeccionAlquiler(input);

    expect(resultado.años).toHaveLength(25);

    // 1. saldoPendiente estrictamente decreciente.
    for (let i = 1; i < resultado.años.length; i++) {
      expect(resultado.años[i].saldoPendienteHipoteca).toBeLessThan(
        resultado.años[i - 1].saldoPendienteHipoteca,
      );
    }

    // 2. último año prácticamente a 0.
    const ultimoAño = resultado.años[resultado.años.length - 1];
    expect(ultimoAño.saldoPendienteHipoteca).toBeCloseTo(0, 2);

    // 3. suma de capital amortizado ≈ capitalPrestamo.
    const sumaCapitalAmortizado = resultado.años.reduce((s, a) => s + a.capitalAmortizadoAño, 0);
    expect(sumaCapitalAmortizado).toBeCloseTo(base.capitalPrestamo, 2);

    // 4. suma de intereses ≈ cuotaMensual*numeroCuotas - capitalPrestamo.
    const numeroCuotas = Math.round(input.plazoHipotecaAnios * 12);
    const interesesTotalesEsperados = base.cuotaMensualHipoteca * numeroCuotas - base.capitalPrestamo;
    const sumaIntereses = resultado.años.reduce((s, a) => s + a.interesesAño, 0);
    expect(sumaIntereses).toBeCloseTo(interesesTotalesEsperados, 2);

    // 5. patrimonio neto del último año ≈ precioVivienda.
    expect(ultimoAño.patrimonioNetoAcumulado).toBeCloseTo(input.precioVivienda, 2);

    // 6. retornoTotalAcumulado del último año ≈ capitalPrestamo + cashflowAcumulado.
    expect(ultimoAño.retornoTotalAcumulado).toBeCloseTo(
      base.capitalPrestamo + ultimoAño.cashflowAcumulado,
      2,
    );
    expect(resultado.retornoTotalFinalSobreInversionPct).toBeCloseTo(
      ultimoAño.retornoTotalSobreInversionPct,
      5,
    );

    // 7. anualizado (CAGR) reconstruye el acumulado al componerlo 25 años,
    // y es mucho menor que el acumulado en términos absolutos (25 años >> 1).
    expect(resultado.retornoTotalAnualizadoPct).toBeLessThan(resultado.retornoTotalFinalSobreInversionPct);
    const multiploReconstruido = Math.pow(1 + resultado.retornoTotalAnualizadoPct / 100, 25);
    expect((multiploReconstruido - 1) * 100).toBeCloseTo(resultado.retornoTotalFinalSobreInversionPct, 2);
  });
});

describe('calcularPerdidaPoderAdquisitivo', () => {
  it('10.000€ al 3% de inflación durante 10 años (verificado a mano)', () => {
    // 1.03^10 ≈ 1.343916379
    const r = calcularPerdidaPoderAdquisitivo({
      capitalInicial: 10000,
      inflacionAnualPct: 3,
      anios: 10,
    });
    expect(r.valorRealFuturo).toBeCloseTo(7440.94, 2);
    expect(r.perdidaPoderAdquisitivo).toBeCloseTo(2559.06, 2);
    expect(r.perdidaPorcentual).toBeCloseTo(25.59, 2);
    expect(r.nominalNecesarioParaIgualarHoy).toBeCloseTo(13439.16, 2);
  });

  it('sin inflación (0%), el valor real no cambia', () => {
    const r = calcularPerdidaPoderAdquisitivo({ capitalInicial: 5000, inflacionAnualPct: 0, anios: 20 });
    expect(r.valorRealFuturo).toBeCloseTo(5000, 5);
    expect(r.perdidaPoderAdquisitivo).toBeCloseTo(0, 5);
    expect(r.perdidaPorcentual).toBeCloseTo(0, 5);
  });

  it('rechaza un plazo de cero años', () => {
    expect(() => calcularPerdidaPoderAdquisitivo({ capitalInicial: 1000, inflacionAnualPct: 3, anios: 0 })).toThrow();
  });

  it('rechaza una inflación negativa', () => {
    expect(() =>
      calcularPerdidaPoderAdquisitivo({ capitalInicial: 1000, inflacionAnualPct: -1, anios: 5 }),
    ).toThrow();
  });
});
