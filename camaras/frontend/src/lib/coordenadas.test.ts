import { describe, it, expect } from 'vitest';
import { parsearCoordenada } from './coordenadas';

describe('parsearCoordenada', () => {
  it('admite coma o punto decimal y negativos', () => {
    expect(parsearCoordenada('38,8794')).toBe(38.8794);
    expect(parsearCoordenada(' -6.9707 ')).toBe(-6.9707);
  });

  it('vacío o texto no es un número (no se convierte en 0)', () => {
    expect(parsearCoordenada('')).toBeNull();
    expect(parsearCoordenada('   ')).toBeNull();
    expect(parsearCoordenada('abc')).toBeNull();
  });
});
