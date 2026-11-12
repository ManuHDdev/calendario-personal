import { beforeEach, describe, expect, it } from 'vitest';
import { parseFiltro, safeFrom, saveScroll, takeScroll, withFiltro } from './listState';

describe('parseFiltro', () => {
  it('accepts every tab and falls back to todos', () => {
    expect(parseFiltro('en_espera')).toBe('en_espera');
    expect(parseFiltro('listos')).toBe('listos');
    expect(parseFiltro('nope')).toBe('todos');
    expect(parseFiltro(null)).toBe('todos');
    expect(parseFiltro('')).toBe('todos');
  });
});

describe('withFiltro', () => {
  it('sets the tab, keeps the search and drops the default tab from the URL', () => {
    const p = new URLSearchParams('q=cable');
    expect(withFiltro(p, 'listos').toString()).toBe('q=cable&filtro=listos');
    expect(withFiltro(new URLSearchParams('filtro=listos&q=cable'), 'todos').toString()).toBe('q=cable');
    expect(p.toString()).toBe('q=cable');
  });
});

describe('safeFrom', () => {
  it('only accepts in-app absolute paths', () => {
    expect(safeFrom('/?filtro=listos')).toBe('/?filtro=listos');
    expect(safeFrom('//evil.com')).toBeNull();
    expect(safeFrom('https://evil.com')).toBeNull();
    expect(safeFrom(undefined)).toBeNull();
  });
});

describe('scroll memory', () => {
  beforeEach(() => sessionStorage.clear());
  it('returns the position once and only for the same list URL', () => {
    saveScroll('/?filtro=listos', 420);
    expect(takeScroll('/')).toBeNull();
    saveScroll('/?filtro=listos', 420);
    expect(takeScroll('/?filtro=listos')).toBe(420);
    expect(takeScroll('/?filtro=listos')).toBeNull();
  });
});
