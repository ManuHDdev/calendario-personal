import { describe, it, expect } from 'vitest';
import { PROVINCIA_A_CAPITAL, CAPITALES, provinciaDeCapital } from './capitales';

describe('PROVINCIA_A_CAPITAL', () => {
  it('tiene exactamente 52 entradas (50 provincias + Ceuta + Melilla)', () => {
    expect(Object.keys(PROVINCIA_A_CAPITAL)).toHaveLength(52);
  });

  it('no tiene nombres de capital duplicados', () => {
    const capitales = Object.values(PROVINCIA_A_CAPITAL);
    const unicos = new Set(capitales);
    expect(unicos.size).toBe(capitales.length);
  });

  it('no tiene provincias duplicadas como clave', () => {
    const provincias = Object.keys(PROVINCIA_A_CAPITAL);
    const unicas = new Set(provincias);
    expect(unicas.size).toBe(provincias.length);
  });

  it('CAPITALES refleja los 52 valores del mapa', () => {
    expect(CAPITALES).toHaveLength(52);
    expect(CAPITALES).toEqual(Object.values(PROVINCIA_A_CAPITAL));
  });
});

describe('provinciaDeCapital', () => {
  it('resuelve una capital conocida a su provincia', () => {
    expect(provinciaDeCapital('Bilbao')).toBe('Bizkaia');
    expect(provinciaDeCapital('Vitoria-Gasteiz')).toBe('Araba');
    expect(provinciaDeCapital('A Coruña')).toBe('A Coruña');
  });

  it('devuelve null para algo que no es una capital', () => {
    expect(provinciaDeCapital('Plasencia')).toBeNull();
  });
});
