import { describe, it, expect } from 'vitest';
import { cumpleCriterios, parsearExclusiones, precioPorMetro, type Criterios } from './criterios';
import type { AnuncioCrudo } from '../types/pisos';

const SIN_FILTROS: Criterios = {
  tipo: 'vivienda',
  ubicacion: '', // vacío = no filtra por municipio
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
    tipo: 'vivienda',
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

describe('cumpleCriterios — municipio', () => {
  const enCaceres = { ...SIN_FILTROS, ubicacion: 'Cáceres' };

  it('acepta el anuncio que está en el municipio buscado', () => {
    expect(cumpleCriterios(anuncio({ ubicacion: 'Casco Antiguo, Cáceres' }), enCaceres).cumple).toBe(true);
    expect(cumpleCriterios(anuncio({ ubicacion: 'Centro (Cáceres Capital)' }), enCaceres).cumple).toBe(true);
    expect(cumpleCriterios(anuncio({ ubicacion: 'Cáceres' }), enCaceres).cumple).toBe(true);
  });

  it('descarta otros municipios de la misma provincia', () => {
    expect(cumpleCriterios(anuncio({ ubicacion: 'Plasencia' }), enCaceres).cumple).toBe(false);
    // "Casar de Cáceres" contiene la palabra pero es OTRO municipio
    expect(cumpleCriterios(anuncio({ ubicacion: 'Casar de Cáceres' }), enCaceres).cumple).toBe(false);
  });

  it('descarta el anuncio sin ubicación conocida (la ubicación es el eje de la búsqueda)', () => {
    expect(cumpleCriterios(anuncio({ ubicacion: null }), enCaceres).cumple).toBe(false);
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

describe('cumpleCriterios — tipo de inmueble', () => {
  const LOCAL_SIN_FILTROS: Criterios = { ...SIN_FILTROS, tipo: 'local' };

  it('descarta un anuncio cuyo tipo no coincide con el de la búsqueda', () => {
    const v = cumpleCriterios(anuncio({ tipo: 'vivienda' }), LOCAL_SIN_FILTROS);
    expect(v.cumple).toBe(false);
    if (!v.cumple) expect(v.motivo).toContain('local');
    expect(cumpleCriterios(anuncio({ tipo: 'local' }), SIN_FILTROS).cumple).toBe(false);
  });

  it('para un local NO evalúa habitaciones, baños, ascensor, garaje ni terraza', () => {
    const local = anuncio({
      tipo: 'local',
      habitaciones: null,
      banos: null,
      ascensor: false,
      garaje: false,
      terraza: false,
    });
    const exigente: Criterios = {
      ...LOCAL_SIN_FILTROS,
      habitaciones_min: 3,
      banos_min: 2,
      exige_ascensor: true,
      exige_garaje: true,
      exige_terraza: true,
    };
    expect(cumpleCriterios(local, exigente).cumple).toBe(true);
  });

  it('para un local SÍ sigue aplicando ubicación, precio, metros y palabras excluidas', () => {
    const enBadajoz: Criterios = { ...LOCAL_SIN_FILTROS, ubicacion: 'Badajoz' };
    // precio desconocido con rango → descarta
    expect(
      cumpleCriterios(anuncio({ tipo: 'local', precio: null }), { ...enBadajoz, precio_max: 200000 }).cumple,
    ).toBe(false);
    // precio conocido dentro de rango → pasa
    expect(
      cumpleCriterios(anuncio({ tipo: 'local', precio: 150000 }), { ...enBadajoz, precio_max: 200000 }).cumple,
    ).toBe(true);
    // fuera de rango → descarta
    expect(
      cumpleCriterios(anuncio({ tipo: 'local', precio: 300000 }), { ...enBadajoz, precio_max: 200000 }).cumple,
    ).toBe(false);
    // metros fuera de rango → descarta
    expect(
      cumpleCriterios(anuncio({ tipo: 'local', metros: 40 }), { ...enBadajoz, metros_min: 100 }).cumple,
    ).toBe(false);
    // palabra excluida → descarta
    expect(
      cumpleCriterios(anuncio({ tipo: 'local', titulo: 'Local en traspaso' }), {
        ...enBadajoz,
        excluir_palabras: 'traspaso',
      }).cumple,
    ).toBe(false);
    // fuera del municipio → descarta
    expect(
      cumpleCriterios(anuncio({ tipo: 'local', ubicacion: 'Mérida' }), enBadajoz).cumple,
    ).toBe(false);
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
