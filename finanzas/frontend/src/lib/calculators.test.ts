import { describe, it, expect } from 'vitest';
import {
  calcularInteresCompuesto,
  calcularPrestamoMaximo,
  calcularAhorroNecesario,
  calcularCuotaMaximaHipoteca,
  calcularPrecioMaximoVivienda,
  calcularColchonSeguridad,
  calcularDeuda,
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
