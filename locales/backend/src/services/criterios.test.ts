import { describe, it, expect } from 'vitest';
import { cumpleCriterios, precioPorMetro, type Criterios } from './criterios';
import type { AnuncioCrudo } from '../types/locales';

const SIN_FILTROS: Criterios = {
  tipo: 'local',
  zona: null,
  municipio: null,
  provincia: null,
  comunidad: null,
  precioMin: null,
  precioMax: null,
  superficieMin: null,
  superficieMax: null,
  pieCalle: null,
  facturacionMin: null,
  facturacionMax: null,
};

function anuncio(over: Partial<AnuncioCrudo> = {}): AnuncioCrudo {
  return {
    tipo: 'local',
    portal: 'fotocasa',
    portalId: '1',
    url: 'https://example.test/1',
    titulo: 'Local comercial en venta',
    descripcion: null,
    precio: 120000,
    precioAnterior: null,
    superficieM2: 90,
    facturacion: null,
    direccion: null,
    municipio: 'Badajoz',
    provincia: 'Badajoz',
    comunidad: null,
    latitud: null,
    longitud: null,
    precision: 'desconocida',
    imagenUrl: null,
    ...over,
  };
}

describe('cumpleCriterios — rangos', () => {
  it('acepta un anuncio dentro de todos los rangos', () => {
    expect(
      cumpleCriterios(anuncio(), { ...SIN_FILTROS, precioMax: 150000, superficieMin: 80 }).cumple,
    ).toBe(true);
  });

  it('descarta por precio fuera de rango', () => {
    expect(cumpleCriterios(anuncio({ precio: 200000 }), { ...SIN_FILTROS, precioMax: 150000 }).cumple).toBe(false);
    expect(cumpleCriterios(anuncio({ precio: 50000 }), { ...SIN_FILTROS, precioMin: 80000 }).cumple).toBe(false);
  });

  it('descarta un anuncio sin precio SOLO si hay filtro de precio', () => {
    expect(cumpleCriterios(anuncio({ precio: null }), { ...SIN_FILTROS, precioMax: 150000 }).cumple).toBe(false);
    expect(cumpleCriterios(anuncio({ precio: null }), SIN_FILTROS).cumple).toBe(true);
  });

  it('descarta por superficie fuera de la horquilla', () => {
    expect(cumpleCriterios(anuncio({ superficieM2: 40 }), { ...SIN_FILTROS, superficieMin: 80 }).cumple).toBe(false);
    expect(cumpleCriterios(anuncio({ superficieM2: 500 }), { ...SIN_FILTROS, superficieMax: 200 }).cumple).toBe(false);
  });
});

describe('cumpleCriterios — dato desconocido no descarta', () => {
  it('no descarta por superficie que el portal no informa', () => {
    expect(
      cumpleCriterios(anuncio({ superficieM2: null }), { ...SIN_FILTROS, superficieMin: 100 }).cumple,
    ).toBe(true);
  });

  it('no descarta por facturación desconocida en una farmacia', () => {
    const far = anuncio({ tipo: 'farmacia', facturacion: null, municipio: 'Madrid', provincia: 'Madrid' });
    expect(
      cumpleCriterios(far, { ...SIN_FILTROS, tipo: 'farmacia', facturacionMin: 500000 }).cumple,
    ).toBe(true);
  });

  it('pie de calle: null pasa, un texto de "primera planta" descarta', () => {
    expect(cumpleCriterios(anuncio(), { ...SIN_FILTROS, pieCalle: true }).cumple).toBe(true);
    expect(
      cumpleCriterios(anuncio({ descripcion: 'Se vende en primera planta del edificio' }), {
        ...SIN_FILTROS,
        pieCalle: true,
      }).cumple,
    ).toBe(false);
  });
});

describe('cumpleCriterios — ubicación (eje de la búsqueda)', () => {
  const enBadajoz = { ...SIN_FILTROS, municipio: 'Badajoz' };

  it('acepta el anuncio en el municipio buscado', () => {
    expect(cumpleCriterios(anuncio({ municipio: 'Badajoz' }), enBadajoz).cumple).toBe(true);
  });

  it('descarta otro municipio de la misma provincia', () => {
    expect(cumpleCriterios(anuncio({ municipio: 'Mérida', provincia: 'Badajoz' }), enBadajoz).cumple).toBe(false);
  });

  it('descarta el anuncio sin ubicación conocida', () => {
    expect(
      cumpleCriterios(
        anuncio({ municipio: null, provincia: null, comunidad: null, direccion: null }),
        enBadajoz,
      ).cumple,
    ).toBe(false);
  });

  it('farmacia con solo comunidad casa contra una provincia buscada', () => {
    const far = anuncio({ tipo: 'farmacia', municipio: null, provincia: null, comunidad: 'madrid' });
    expect(
      cumpleCriterios(far, { ...SIN_FILTROS, tipo: 'farmacia', provincia: 'Madrid' }).cumple,
    ).toBe(true);
  });

  it('facturación fuera de rango descarta una farmacia', () => {
    const far = anuncio({ tipo: 'farmacia', facturacion: 300000, municipio: 'Madrid', provincia: 'Madrid' });
    expect(
      cumpleCriterios(far, { ...SIN_FILTROS, tipo: 'farmacia', facturacionMin: 500000 }).cumple,
    ).toBe(false);
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
