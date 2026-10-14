import { describe, it, expect } from 'vitest';
import { assembleTotales } from './totales';

describe('assembleTotales — mes', () => {
  it('splits gastos and ganancias, keeps total === gastos and computes the balance', () => {
    const result = assembleTotales({ mes: '2026-03' }, [
      { tipo: 'gasto', categoria: 'Comida', total: '120.50' },
      { tipo: 'gasto', categoria: 'Ocio', total: 79.5 },
      { tipo: 'ganancia', categoria: 'Nómina', total: '3000' },
    ]);
    expect(result).toEqual({
      periodo: 'mes',
      mes: '2026-03',
      gastos: 200,
      ganancias: 3000,
      balance: 2800,
      total: 200,
      porCategoria: [
        { categoria: 'Comida', tipo: 'gasto', total: 120.5 },
        { categoria: 'Ocio', tipo: 'gasto', total: 79.5 },
        { categoria: 'Nómina', tipo: 'ganancia', total: 3000 },
      ],
    });
    expect(result).not.toHaveProperty('porMes');
    expect(result).not.toHaveProperty('anio');
  });

  it('returns zeros and an empty breakdown for an empty period', () => {
    const result = assembleTotales({ mes: '2026-03' }, []);
    expect(result.gastos).toBe(0);
    expect(result.ganancias).toBe(0);
    expect(result.balance).toBe(0);
    expect(result.total).toBe(0);
    expect(result.porCategoria).toEqual([]);
  });

  it('gives a negative balance when expenses exceed income', () => {
    const result = assembleTotales({ mes: '2026-03' }, [
      { tipo: 'gasto', categoria: 'Alquiler', total: 900 },
      { tipo: 'ganancia', categoria: 'Extra', total: 100 },
    ]);
    expect(result.balance).toBe(-800);
  });

  it('does not accumulate floating point noise (0.1 + 0.2)', () => {
    const result = assembleTotales({ mes: '2026-03' }, [
      { tipo: 'gasto', categoria: 'A', total: '0.10' },
      { tipo: 'gasto', categoria: 'B', total: '0.20' },
    ]);
    expect(result.gastos).toBe(0.3);
  });
});

describe('assembleTotales — anio', () => {
  it('always returns exactly 12 zero-filled months YYYY-01..YYYY-12', () => {
    const result = assembleTotales({ anio: '2026' }, []);
    expect(result.periodo).toBe('anio');
    expect(result.anio).toBe('2026');
    expect(result).not.toHaveProperty('mes');
    expect(result.porMes).toHaveLength(12);
    expect(result.porMes?.map((m) => m.mes)).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
      '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
    ]);
    expect(result.porMes?.every((m) => m.gastos === 0 && m.ganancias === 0)).toBe(true);
  });

  it('fills only the months that have movements and leaves the other eleven at zero', () => {
    const result = assembleTotales(
      { anio: '2026' },
      [
        { tipo: 'gasto', categoria: 'Comida', total: 1200 },
        { tipo: 'ganancia', categoria: 'Nómina', total: 3000 },
      ],
      [
        { mes: '2026-03', tipo: 'gasto', total: '1200' },
        { mes: '2026-03', tipo: 'ganancia', total: '3000' },
      ],
    );
    expect(result.gastos).toBe(1200);
    expect(result.ganancias).toBe(3000);
    expect(result.balance).toBe(1800);
    expect(result.total).toBe(1200);
    const marzo = result.porMes?.find((m) => m.mes === '2026-03');
    expect(marzo).toEqual({ mes: '2026-03', gastos: 1200, ganancias: 3000 });
    const resto = result.porMes?.filter((m) => m.mes !== '2026-03') ?? [];
    expect(resto).toHaveLength(11);
    expect(resto.every((m) => m.gastos === 0 && m.ganancias === 0)).toBe(true);
  });

  it('ignores rows outside the requested year instead of growing porMes', () => {
    const result = assembleTotales({ anio: '2026' }, [], [
      { mes: '2027-01', tipo: 'gasto', total: 10 },
    ]);
    expect(result.porMes).toHaveLength(12);
    expect(result.porMes?.every((m) => m.gastos === 0)).toBe(true);
  });
});
