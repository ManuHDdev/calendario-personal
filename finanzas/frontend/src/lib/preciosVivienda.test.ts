import { describe, it, expect } from 'vitest';
import { formatearHace, trimestreATimestamp, fechaCapturaATimestamp } from './preciosVivienda';

describe('trimestreATimestamp', () => {
  it('convierte T1 2024 al 1 de enero de 2024 en segundos UTC', () => {
    expect(trimestreATimestamp(2024, 1)).toBe(Date.UTC(2024, 0, 1) / 1000);
  });

  it('convierte T4 1995 al 1 de octubre de 1995', () => {
    expect(trimestreATimestamp(1995, 4)).toBe(Date.UTC(1995, 9, 1) / 1000);
  });
});

describe('fechaCapturaATimestamp', () => {
  it('convierte una fecha DATE (YYYY-MM-DD) a segundos UTC del mismo día', () => {
    expect(fechaCapturaATimestamp('2026-09-17')).toBe(Date.UTC(2026, 8, 17) / 1000);
  });

  it('no se desplaza de día por zona horaria (parseo manual, no `new Date(string)`)', () => {
    expect(fechaCapturaATimestamp('2026-01-01')).toBe(Date.UTC(2026, 0, 1) / 1000);
  });
});

describe('formatearHace', () => {
  it('devuelve "nunca" cuando no hay fecha', () => {
    expect(formatearHace(null)).toBe('nunca');
  });

  it('devuelve "nunca" ante una fecha inválida', () => {
    expect(formatearHace('no-es-una-fecha')).toBe('nunca');
  });

  it('formatea minutos, horas y días razonablemente', () => {
    const haceUnosMinutos = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatearHace(haceUnosMinutos)).toBe('hace 5 min');

    const haceUnDia = new Date(Date.now() - 25 * 60 * 60_000).toISOString();
    expect(formatearHace(haceUnDia)).toBe('hace 1 día');
  });
});
