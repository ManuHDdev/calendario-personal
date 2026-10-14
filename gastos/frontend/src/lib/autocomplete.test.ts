import { describe, expect, it } from 'vitest';
import { normalizar, opcionExacta, sugerir } from './autocomplete';

describe('normalizar', () => {
  it('lowercases, strips accents and trims', () => {
    expect(normalizar('  Máquina CAFÉ ')).toBe('maquina cafe');
  });
});

describe('sugerir', () => {
  const opciones = ['Supermercado', 'Gasolina', 'Suministros', 'Ocio', 'Casa', 'Restaurante', 'Salud', 'Transporte'];

  it('offers the five most used values for an empty input', () => {
    expect(sugerir(opciones, '')).toEqual(['Supermercado', 'Gasolina', 'Suministros', 'Ocio', 'Casa']);
    expect(sugerir(opciones, '   ')).toHaveLength(5);
  });

  it('matches prefixes ignoring case', () => {
    expect(sugerir(opciones, 'su')).toEqual(['Supermercado', 'Suministros']);
  });

  it('puts prefix matches before substring matches and keeps server order inside each group', () => {
    const lista = ['Casa', 'Salud', 'Sala de juegos', 'Musa', 'Ocio'];
    expect(sugerir(lista, 'sa')).toEqual(['Salud', 'Sala de juegos', 'Casa', 'Musa']);
  });

  it('ignores accents on both sides', () => {
    expect(sugerir(['Educación', 'Electricidad'], 'educacion')).toEqual(['Educación']);
    expect(sugerir(['Educacion'], 'EDUCACIÓN')).toEqual(['Educacion']);
  });

  it('caps the result at six', () => {
    const muchas = Array.from({ length: 20 }, (_, i) => `Compra ${i}`);
    expect(sugerir(muchas, 'compra')).toHaveLength(6);
    expect(sugerir(muchas, 'compra')[0]).toBe('Compra 0');
  });

  it('drops duplicates that only differ in case or accents', () => {
    expect(sugerir(['Café', 'cafe', 'Cafetería'], 'caf')).toEqual(['Café', 'Cafetería']);
  });

  it('returns nothing when nothing matches, so free text stays possible', () => {
    expect(sugerir(opciones, 'zzz')).toEqual([]);
    expect(sugerir([], 'su')).toEqual([]);
  });
});

describe('opcionExacta', () => {
  it('returns the stored spelling for a case/accent-insensitive match', () => {
    expect(opcionExacta(['Educación', 'Ocio'], 'educacion')).toBe('Educación');
  });

  it('returns null for partial or empty input', () => {
    expect(opcionExacta(['Educación'], 'educ')).toBeNull();
    expect(opcionExacta(['Educación'], '')).toBeNull();
  });
});
