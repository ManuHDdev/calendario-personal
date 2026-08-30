import { describe, it, expect } from 'vitest';
import { cumpleCriterios, parsearExclusiones, precioPorMetro, type Criterios } from './criterios';
import type { AnuncioCrudo } from '../types/pisos';

const SIN_FILTROS: Criterios = {
  precio_min: null,
  precio_max: null,
  metros_min: null,
  metros_max: null,
  habitaciones_min: null,
  banos_min: null,
  exige_ascensor: false,
  exige_garaje: false,
  exige_terraza: false,
  excluir_palabras: null,
};

function anuncio(overrides: Partial<AnuncioCrudo> = {}): AnuncioCrudo {
  return {
    portal: 'fotocasa',
    portalId: '1',
    url: 'https://example.test/1',
    titulo: 'Piso en venta',
    precio: 120000,
    metros: 90,
    habitaciones: 3,
    banos: 2,
    planta: '2ª',
    ascensor: true,
    garaje: null,
    terraza: null,
    ubicacion: 'Badajoz',
    latitud: null,
    longitud: null,
    imagenUrl: null,
    ...overrides,
  };
}

describe('cumpleCriterios — rangos', () => {
  it('acepta un anuncio dentro de todos los rangos', () => {
    expect(cumpleCriterios(anuncio(), { ...SIN_FILTROS, precio_max: 150000, metros_min: 80 }).cumple).toBe(true);
  });

  it('descarta por precio fuera de rango', () => {
    expect(cumpleCriterios(anuncio({ precio: 200000 }), { ...SIN_FILTROS, precio_max: 150000 }).cumple).toBe(false);
    expect(cumpleCriterios(anuncio({ precio: 50000 }), { ...SIN_FILTROS, precio_min: 80000 }).cumple).toBe(false);
  });

  it('descarta un anuncio sin precio SOLO si hay filtro de precio', () => {
    // Un "consúltanos precio" no sirve para buscar por presupuesto, pero sin
    // filtro de precio tampoco hay razón para tirarlo.
    expect(cumpleCriterios(anuncio({ precio: null }), { ...SIN_FILTROS, precio_max: 150000 }).cumple).toBe(false);
    expect(cumpleCriterios(anuncio({ precio: null }), SIN_FILTROS).cumple).toBe(true);
  });

  it('descarta por superficie y por mínimos de habitaciones y baños', () => {
    expect(cumpleCriterios(anuncio({ metros: 50 }), { ...SIN_FILTROS, metros_min: 80 }).cumple).toBe(false);
    expect(cumpleCriterios(anuncio({ habitaciones: 1 }), { ...SIN_FILTROS, habitaciones_min: 3 }).cumple).toBe(false);
    expect(cumpleCriterios(anuncio({ banos: 1 }), { ...SIN_FILTROS, banos_min: 2 }).cumple).toBe(false);
  });
});

describe('cumpleCriterios — dato desconocido', () => {
  it('NO descarta por un dato que el portal no informa', () => {
    // Es la regla transversal de la app: null es "no lo sé", no "no lo
    // tiene". Un anuncio de Wallapop sin metros en el título debe llegar al
    // feed, no desaparecer sin que nadie se entere.
    const sinDatos = anuncio({ metros: null, habitaciones: null, banos: null });
    const exigente: Criterios = {
      ...SIN_FILTROS,
      metros_min: 100,
      habitaciones_min: 4,
      banos_min: 3,
    };
    expect(cumpleCriterios(sinDatos, exigente).cumple).toBe(true);
  });

  it('descarta solo cuando el anuncio dice EXPLÍCITAMENTE que no lo tiene', () => {
    expect(cumpleCriterios(anuncio({ ascensor: false }), { ...SIN_FILTROS, exige_ascensor: true }).cumple).toBe(false);
    expect(cumpleCriterios(anuncio({ ascensor: null }), { ...SIN_FILTROS, exige_ascensor: true }).cumple).toBe(true);
    expect(cumpleCriterios(anuncio({ garaje: false }), { ...SIN_FILTROS, exige_garaje: true }).cumple).toBe(false);
    expect(cumpleCriterios(anuncio({ terraza: false }), { ...SIN_FILTROS, exige_terraza: true }).cumple).toBe(false);
  });
});

describe('cumpleCriterios — palabras excluidas', () => {
  it('descarta ignorando mayúsculas y acentos', () => {
    const criterios = { ...SIN_FILTROS, excluir_palabras: 'subasta, nuda propiedad' };
    expect(cumpleCriterios(anuncio({ titulo: 'Piso en SUBASTA judicial' }), criterios).cumple).toBe(false);
    expect(cumpleCriterios(anuncio({ titulo: 'Venta de nuda propiedad' }), criterios).cumple).toBe(false);
    expect(cumpleCriterios(anuncio({ titulo: 'Piso reformado' }), criterios).cumple).toBe(true);
  });

  it('también mira la ubicación, no solo el título', () => {
    const criterios = { ...SIN_FILTROS, excluir_palabras: 'pedanía' };
    expect(cumpleCriterios(anuncio({ ubicacion: 'Pedanía de Valdelacalzada' }), criterios).cumple).toBe(false);
  });

  it('da el motivo del descarte para poder depurar una búsqueda', () => {
    const veredicto = cumpleCriterios(anuncio({ precio: 300000 }), { ...SIN_FILTROS, precio_max: 150000 });
    expect(veredicto.cumple).toBe(false);
    if (!veredicto.cumple) expect(veredicto.motivo).toContain('precio');
  });
});

describe('parsearExclusiones', () => {
  it('limpia espacios, acentos y términos vacíos', () => {
    expect(parsearExclusiones(' Subasta , , OKUPA ')).toEqual(['subasta', 'okupa']);
    expect(parsearExclusiones(null)).toEqual([]);
    expect(parsearExclusiones('')).toEqual([]);
  });
});

describe('precioPorMetro', () => {
  it('calcula el €/m² y se abstiene si falta un dato', () => {
    expect(precioPorMetro(120000, 90)).toBe(1333);
    expect(precioPorMetro(120000, null)).toBeNull();
    expect(precioPorMetro(null, 90)).toBeNull();
    expect(precioPorMetro(120000, 0)).toBeNull();
  });
});
