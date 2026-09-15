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
});
