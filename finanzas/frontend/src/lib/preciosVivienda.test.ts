import { describe, it, expect } from 'vitest';
import { etiquetaTrimestre, aDatosGrafica, formatearHace } from './preciosVivienda';

describe('etiquetaTrimestre', () => {
  it('formatea año y trimestre', () => {
    expect(etiquetaTrimestre(2024, 1)).toBe('T1 2024');
    expect(etiquetaTrimestre(1995, 4)).toBe('T4 1995');
  });
});

describe('aDatosGrafica', () => {
  it('adapta la serie de la API al formato de Recharts, preservando null', () => {
    const resultado = aDatosGrafica([
      { ambito: 'provincia', nombre: 'Almería', comunidad_autonoma: 'Andalucía', anio: 2024, trimestre: 1, precio_m2: 1218.1 },
      { ambito: 'provincia', nombre: 'Almería', comunidad_autonoma: 'Andalucía', anio: 2024, trimestre: 2, precio_m2: null },
    ]);
    expect(resultado).toEqual([
      { etiqueta: 'T1 2024', precio: 1218.1 },
      { etiqueta: 'T2 2024', precio: null },
    ]);
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
