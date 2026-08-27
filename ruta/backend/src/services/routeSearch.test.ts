import { describe, it, expect } from 'vitest';
import { parseExcludeList, isExcluded } from './routeSearch';

describe('parseExcludeList', () => {
  it('returns nothing for empty input', () => {
    expect(parseExcludeList(undefined)).toEqual([]);
    expect(parseExcludeList(null)).toEqual([]);
    expect(parseExcludeList('')).toEqual([]);
    expect(parseExcludeList('  ,  , ')).toEqual([]);
  });

  it('splits on commas and trims', () => {
    expect(parseExcludeList('carta, cartas ,tcg')).toEqual(['carta', 'cartas', 'tcg']);
  });

  it('folds case and accents so the filter is spelling-tolerant', () => {
    expect(parseExcludeList('RÉPLICA, Batería')).toEqual(['replica', 'bateria']);
  });

  it('keeps multi-word phrases intact', () => {
    expect(parseExcludeList('trading card, funda rigida')).toEqual([
      'trading card',
      'funda rigida',
    ]);
  });
});

describe('isExcluded', () => {
  const terms = parseExcludeList('carta,cartas,tcg,trading card,funko');

  it('keeps a listing when nothing is excluded', () => {
    expect(isExcluded('Nintendo Switch Pokemon Escarlata', [])).toBe(false);
  });

  it('drops a listing whose title contains an excluded word', () => {
    expect(isExcluded('Lote de cartas Pokemon Escarlata', terms)).toBe(true);
  });

  it('matches whole words only, never substrings', () => {
    // The motivating bug: excluding "carta" must not drop a "cartabon".
    expect(isExcluded('Cartabon de dibujo tecnico', terms)).toBe(false);
    expect(isExcluded('Cartapacio de piel', terms)).toBe(false);
  });

  it('ignores case and accents in the title', () => {
    expect(isExcluded('LOTE DE CÁRTAS POKEMON', terms)).toBe(true);
    expect(isExcluded('Figura FUNKO Pop', terms)).toBe(true);
  });

  it('matches a multi-word phrase', () => {
    expect(isExcluded('Album trading card coleccion', terms)).toBe(true);
  });

  it('matches a term at the very start or end of the title', () => {
    expect(isExcluded('cartas sueltas', terms)).toBe(true);
    expect(isExcluded('coleccion de cartas', terms)).toBe(true);
  });

  it('treats punctuation as a word boundary', () => {
    expect(isExcluded('Pokemon (cartas) sin usar', terms)).toBe(true);
    expect(isExcluded('Pokemon: tcg edicion base', terms)).toBe(true);
  });

  it('does not blow up on regex metacharacters in the exclude list', () => {
    const risky = parseExcludeList('c++, a.b, (oferta)');
    expect(() => isExcluded('Curso de c++ avanzado', risky)).not.toThrow();
    expect(isExcluded('Curso de c++ avanzado', risky)).toBe(true);
    // "a.b" must be a literal, so it must not match "axb".
    expect(isExcluded('modelo axb nuevo', risky)).toBe(false);
  });
});
