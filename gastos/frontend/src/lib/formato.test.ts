import { describe, expect, it } from 'vitest';
import {
  diaYSemana,
  formatBalance,
  formatDiaSemana,
  formatFechaLarga,
  formatMoney,
  formatSignedMoney,
  hoyLocal,
  importeParaInput,
  mesDe,
  nombreMes,
  nombreMesConAnio,
  parseFecha,
  parseImporte,
  pluralMovimientos,
} from './formato';

const NBSP = ' ';
const MINUS = '−';

describe('formatMoney', () => {
  it('uses Spanish separators and always groups thousands', () => {
    expect(formatMoney(1234.5)).toBe(`1.234,50${NBSP}€`);
    expect(formatMoney(12)).toBe(`12,00${NBSP}€`);
    expect(formatMoney(1234567.89)).toBe(`1.234.567,89${NBSP}€`);
    expect(formatMoney(0)).toBe(`0,00${NBSP}€`);
  });

  it('is not fooled by floating point noise', () => {
    expect(formatMoney(0.1 + 0.2)).toBe(`0,30${NBSP}€`);
    expect(formatMoney(1.005 * 100)).toBe(`100,50${NBSP}€`);
  });

  it('formats the magnitude only', () => {
    expect(formatMoney(-5)).toBe(`5,00${NBSP}€`);
  });
});

describe('formatSignedMoney / formatBalance', () => {
  it('signs income with + and expenses with a minus sign', () => {
    expect(formatSignedMoney(3000, 'ganancia')).toBe(`+3.000,00${NBSP}€`);
    expect(formatSignedMoney(23.4, 'gasto')).toBe(`${MINUS}23,40${NBSP}€`);
  });

  it('signs a balance by its own sign and leaves zero unsigned', () => {
    expect(formatBalance(1800)).toBe(`+1.800,00${NBSP}€`);
    expect(formatBalance(-45.5)).toBe(`${MINUS}45,50${NBSP}€`);
    expect(formatBalance(0)).toBe(`0,00${NBSP}€`);
    expect(formatBalance(0.001)).toBe(`0,00${NBSP}€`);
  });
});

describe('parseImporte', () => {
  it.each([
    ['12', 12],
    ['12,5', 12.5],
    ['12.50', 12.5],
    ['1.234,50', 1234.5],
    ['1.234', 1234],
    ['  7,25 € ', 7.25],
    ['0,99', 0.99],
  ])('parses %s', (raw, expected) => {
    expect(parseImporte(raw)).toBe(expected);
  });

  it.each(['', 'abc', '12,5,3', '--4', '1,2e3'])('rejects %j', (raw) => {
    expect(parseImporte(raw)).toBeNull();
  });

  it('rounds to cents', () => {
    expect(parseImporte('1,239')).toBe(1.24);
  });

  it('round-trips with importeParaInput', () => {
    expect(importeParaInput(12.5)).toBe('12,5');
    expect(parseImporte(importeParaInput(12.5))).toBe(12.5);
  });
});

describe('dates', () => {
  it('parses the date part without timezone shifts', () => {
    expect(parseFecha('2026-03-01')).toEqual({ anio: 2026, mes: 3, dia: 1 });
    expect(parseFecha('2026-12-31T23:30:00.000Z')).toEqual({ anio: 2026, mes: 12, dia: 31 });
    expect(parseFecha(null)).toBeNull();
    expect(parseFecha('hoy')).toBeNull();
    expect(parseFecha('2026-13-01')).toBeNull();
  });

  it('formats day + short weekday', () => {
    expect(formatDiaSemana('2026-10-14')).toBe('mié 14');
    expect(diaYSemana('2026-01-01')).toEqual({ dia: '1', semana: 'jue' });
    expect(diaYSemana('2026-10-17')).toEqual({ dia: '17', semana: 'sáb' });
    expect(formatDiaSemana(null)).toBe('');
  });

  it('formats long dates and month names', () => {
    expect(formatFechaLarga('2026-10-14')).toBe('14 de octubre de 2026');
    expect(nombreMes('2026-03')).toBe('Marzo');
    expect(nombreMesConAnio('2026-09')).toBe('septiembre de 2026');
  });

  it('extracts the month key', () => {
    expect(mesDe('2026-10-14')).toBe('2026-10');
    expect(mesDe(null)).toBeNull();
  });

  it('builds today from local calendar parts', () => {
    expect(hoyLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(hoyLocal(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31');
  });
});

describe('pluralMovimientos', () => {
  it('handles singular and plural', () => {
    expect(pluralMovimientos(1)).toBe('1 movimiento');
    expect(pluralMovimientos(0)).toBe('0 movimientos');
    expect(pluralMovimientos(12)).toBe('12 movimientos');
  });
});
