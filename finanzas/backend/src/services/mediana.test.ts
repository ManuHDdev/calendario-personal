import { describe, it, expect } from 'vitest';
import { mediana } from './mediana';

describe('mediana', () => {
  it('con un número impar de valores, devuelve el del medio', () => {
    expect(mediana([1, 3, 2])).toBe(2);
  });

  it('con un número par de valores, devuelve la media de los dos centrales', () => {
    expect(mediana([1000, 2000])).toBe(1500);
  });

  it('un único atípico no arrastra el resultado (mismo caso real que Jaén en capitalScraper)', () => {
    const normales = Array.from({ length: 29 }, () => 1800);
    const atipico = 15_800;
    expect(mediana([...normales, atipico])).toBe(1800);
  });

  it('una lista vacía devuelve null, no una mediana de 0', () => {
    expect(mediana([])).toBeNull();
  });

  it('no muta el array de entrada', () => {
    const entrada = [3, 1, 2];
    mediana(entrada);
    expect(entrada).toEqual([3, 1, 2]);
  });
});
