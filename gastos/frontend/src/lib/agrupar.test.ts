import { describe, expect, it } from 'vitest';
import {
  agruparPorMes,
  construirResumenAnual,
  construirTiraMeses,
  filtrarBusqueda,
  SIN_FECHA,
  totalesPrevistos,
} from './agrupar';
import type { Gasto, TotalesPorMes } from '../types';

let seq = 0;
function mov(partial: Partial<Gasto>): Gasto {
  seq += 1;
  return {
    id: `id-${seq}`,
    importe: 10,
    fecha: '2026-01-15',
    comercio: 'Comercio',
    concepto: null,
    categoria: null,
    origen: 'manual',
    estado: 'confirmado',
    tipo: 'gasto',
    imagen_path: null,
    activo: true,
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

describe('agruparPorMes', () => {
  it('groups by month, newest month first, keeping item order inside a month', () => {
    const a = mov({ fecha: '2026-03-20' });
    const b = mov({ fecha: '2026-03-02' });
    const c = mov({ fecha: '2026-01-31' });
    const d = mov({ fecha: '2026-10-01' });
    const grupos = agruparPorMes([a, b, c, d]);
    expect(grupos.map((g) => g.mes)).toEqual(['2026-10', '2026-03', '2026-01']);
    expect(grupos[1].items).toEqual([a, b]);
  });

  it('subtotals income and expenses separately without float noise', () => {
    const grupos = agruparPorMes([
      mov({ fecha: '2026-02-01', importe: 0.1, tipo: 'gasto' }),
      mov({ fecha: '2026-02-02', importe: 0.2, tipo: 'gasto' }),
      mov({ fecha: '2026-02-03', importe: 1500, tipo: 'ganancia' }),
      mov({ fecha: '2026-02-04', importe: 250.25, tipo: 'ganancia' }),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].gastos).toBe(0.3);
    expect(grupos[0].ganancias).toBe(1750.25);
  });

  it('keeps rows without a date in their own last group', () => {
    const grupos = agruparPorMes([mov({ fecha: null }), mov({ fecha: '2026-05-05' })]);
    expect(grupos.map((g) => g.mes)).toEqual(['2026-05', SIN_FECHA]);
  });

  it('returns an empty list for no movements', () => {
    expect(agruparPorMes([])).toEqual([]);
  });

  it('reads the month from the date part, regardless of a time suffix', () => {
    const grupos = agruparPorMes([mov({ fecha: '2026-03-31T23:00:00.000Z' })]);
    expect(grupos[0].mes).toBe('2026-03');
  });
});

describe('filtrarBusqueda', () => {
  const lista = [
    mov({ comercio: 'Mercadona', categoria: 'Supermercado', concepto: 'Compra semanal' }),
    mov({ comercio: 'Cafetería Sol', categoria: 'Ocio', concepto: null }),
    mov({ comercio: 'Nómina', categoria: 'Trabajo', tipo: 'ganancia' }),
  ];

  it('matches merchant, concept and category ignoring case and accents', () => {
    expect(filtrarBusqueda(lista, 'cafeteria')).toHaveLength(1);
    expect(filtrarBusqueda(lista, 'SEMANAL')).toHaveLength(1);
    expect(filtrarBusqueda(lista, 'supermer')).toHaveLength(1);
    expect(filtrarBusqueda(lista, 'nomina')).toHaveLength(1);
  });

  it('returns everything for an empty query and nothing for no match', () => {
    expect(filtrarBusqueda(lista, '  ')).toBe(lista);
    expect(filtrarBusqueda(lista, 'zzz')).toEqual([]);
  });
});

describe('construirTiraMeses', () => {
  it('always returns twelve months and marks only those with movements', () => {
    const porMes: TotalesPorMes[] = Array.from({ length: 12 }, (_, i) => ({
      mes: `2026-${String(i + 1).padStart(2, '0')}`,
      gastos: i === 2 ? 50 : 0,
      ganancias: i === 5 ? 1000 : 0,
    }));
    const tira = construirTiraMeses(2026, porMes);
    expect(tira).toHaveLength(12);
    expect(tira[0]).toMatchObject({ mes: '2026-01', numero: 1, etiqueta: 'Ene', conMovimientos: false });
    expect(tira.filter((m) => m.conMovimientos).map((m) => m.etiqueta)).toEqual(['Mar', 'Jun']);
    expect(tira[11].etiqueta).toBe('Dic');
  });

  it('works while the year totals are still loading', () => {
    const tira = construirTiraMeses(2027, undefined);
    expect(tira).toHaveLength(12);
    expect(tira.every((m) => !m.conMovimientos)).toBe(true);
    expect(tira[0].mes).toBe('2027-01');
  });
});

describe('construirResumenAnual', () => {
  const porMes: TotalesPorMes[] = Array.from({ length: 12 }, (_, i) => ({
    mes: `2026-${String(i + 1).padStart(2, '0')}`,
    gastos: 0,
    ganancias: 0,
  }));
  porMes[0] = { ...porMes[0], gastos: 500, ganancias: 2000 };
  porMes[1] = { ...porMes[1], gastos: 1000 };

  it('scales bars to the largest value of the year and computes balances', () => {
    const filas = construirResumenAnual(porMes);
    expect(filas).toHaveLength(12);
    expect(filas[0]).toMatchObject({ anchoGanancias: 100, anchoGastos: 25, balance: 1500, vacio: false });
    expect(filas[1]).toMatchObject({ anchoGanancias: 0, anchoGastos: 50, balance: -1000 });
    expect(filas[2]).toMatchObject({ vacio: true, balance: 0, anchoGastos: 0, anchoGanancias: 0 });
  });

  it('keeps tiny values visible and handles an all-zero year', () => {
    const casiVacio = porMes.map((m) => ({ ...m }));
    casiVacio[3].gastos = 1;
    expect(construirResumenAnual(casiVacio)[3].anchoGastos).toBeGreaterThanOrEqual(2);

    const vacio = construirResumenAnual(porMes.map((m) => ({ ...m, gastos: 0, ganancias: 0 })));
    expect(vacio.every((f) => f.anchoGastos === 0 && f.anchoGanancias === 0 && f.vacio)).toBe(true);
  });
});

describe('totalesPrevistos', () => {
  it('splits what is left to pay from what is left to collect', () => {
    const r = totalesPrevistos([
      mov({ importe: 100.1, tipo: 'gasto', estado: 'previsto' }),
      mov({ importe: 50.2, tipo: 'gasto', estado: 'previsto' }),
      mov({ importe: 900, tipo: 'ganancia', estado: 'previsto' }),
    ]);
    expect(r).toEqual({ porPagar: 150.3, porCobrar: 900 });
  });

  it('is zero for no forecasts', () => {
    expect(totalesPrevistos([])).toEqual({ porPagar: 0, porCobrar: 0 });
  });
});
