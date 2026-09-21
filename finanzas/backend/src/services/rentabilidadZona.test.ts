import { describe, it, expect, vi } from 'vitest';
import type { AnuncioCrudo, CriteriosPortal, OpcionesBusqueda } from '../portales/types';
import { calcularRentabilidadZona } from './rentabilidadZona';

// Los providers reales hacen fetch a portales externos: se mockean por
// completo para poder controlar exactamente qué "anuncios" devuelve cada
// operación (venta/alquiler) sin red ni fixtures HTML.
const fotocasaBuscar = vi.fn();
const pisosBuscar = vi.fn();

vi.mock('../portales/fotocasa', () => ({
  fotocasaProvider: {
    id: 'fotocasa',
    nombre: 'Fotocasa',
    puedeBuscar: () => ({ ok: true }) as const,
    buscar: (...args: [CriteriosPortal, OpcionesBusqueda?]) => fotocasaBuscar(...args),
  },
}));

vi.mock('../portales/pisoscom', () => ({
  pisosComProvider: {
    id: 'pisos',
    nombre: 'pisos.com',
    puedeBuscar: () => ({ ok: true }) as const,
    buscar: (...args: [CriteriosPortal, OpcionesBusqueda?]) => pisosBuscar(...args),
  },
}));

function anuncio(overrides: Partial<AnuncioCrudo> = {}): AnuncioCrudo {
  return {
    tipo: 'vivienda',
    portal: 'fotocasa',
    portalId: '1',
    url: 'https://example.com/1',
    titulo: 'Piso',
    precio: 100_000,
    metros: 100,
    habitaciones: 3,
    banos: 1,
    planta: null,
    ascensor: null,
    garaje: null,
    terraza: null,
    ubicacion: 'Cáceres',
    latitud: null,
    longitud: null,
    imagenUrl: null,
    ...overrides,
  };
}

/** Configura lo que devuelve cada provider según la operación pedida. */
function mockearBusquedas(porOperacion: { venta?: AnuncioCrudo[]; alquiler?: AnuncioCrudo[] }): void {
  const impl = (criterios: CriteriosPortal) => {
    if (criterios.operacion === 'venta') return Promise.resolve(porOperacion.venta ?? []);
    return Promise.resolve(porOperacion.alquiler ?? []);
  };
  fotocasaBuscar.mockImplementation(impl);
  // pisos.com no aporta nada en estos tests salvo que se indique lo contrario.
  pisosBuscar.mockImplementation(() => Promise.resolve([]));
}

describe('calcularRentabilidadZona', () => {
  it('estima el alquiler de cada anuncio en venta a partir de la mediana de €/m² de alquiler', () => {
    mockearBusquedas({
      venta: [anuncio({ portalId: 'v1', precio: 150_000, metros: 100 })],
      // mediana de 10 y 12 €/m²/mes → 11 €/m²/mes
      alquiler: [
        anuncio({ portalId: 'a1', precio: 1000, metros: 100 }),
        anuncio({ portalId: 'a2', precio: 1200, metros: 100 }),
      ],
    });

    return calcularRentabilidadZona('Cáceres').then((resultado) => {
      expect(resultado.medianaAlquilerM2).toBe(11);
      expect(resultado.numComparablesAlquilerTotal).toBe(2);
      expect(resultado.listings).toHaveLength(1);
      expect(resultado.listings[0].alquilerMensualEstimado).toBe(1100); // 11 * 100
      expect(resultado.listings[0].confianza).toBe('baja'); // 2 < 5
    });
  });

  it('marca confianza alta con 5 o más comparables de alquiler', () => {
    mockearBusquedas({
      venta: [anuncio({ portalId: 'v1' })],
      alquiler: Array.from({ length: 5 }, (_, i) =>
        anuncio({ portalId: `a${i}`, precio: 1000, metros: 100 }),
      ),
    });

    return calcularRentabilidadZona('Cáceres').then((resultado) => {
      expect(resultado.listings[0].confianza).toBe('alta');
      expect(resultado.avisos).toHaveLength(0);
    });
  });

  it('sin comparables de alquiler, alquilerMensualEstimado es null (nunca un número inventado) y hay un aviso', () => {
    mockearBusquedas({ venta: [anuncio({ portalId: 'v1' })], alquiler: [] });

    return calcularRentabilidadZona('Pueblo Sin Datos').then((resultado) => {
      expect(resultado.medianaAlquilerM2).toBeNull();
      expect(resultado.listings[0].alquilerMensualEstimado).toBeNull();
      expect(resultado.listings[0].confianza).toBe('baja');
      expect(resultado.avisos.some((a) => /comparables de alquiler/.test(a))).toBe(true);
    });
  });

  it('un anuncio en venta sin precio o sin metros se excluye del todo (no se puede rankear)', () => {
    mockearBusquedas({
      venta: [
        anuncio({ portalId: 'v1', precio: 100_000, metros: 100 }),
        anuncio({ portalId: 'v2', precio: null, metros: 80 }),
        anuncio({ portalId: 'v3', precio: 90_000, metros: null }),
      ],
      alquiler: [anuncio({ portalId: 'a1', precio: 1000, metros: 100 })],
    });

    return calcularRentabilidadZona('Cáceres').then((resultado) => {
      expect(resultado.listings.map((l) => l.url)).toEqual(['https://example.com/1']);
      expect(resultado.listings).toHaveLength(1);
    });
  });

  it('un anuncio de alquiler sin precio o sin metros no cuenta para la mediana pero no descarta el resto', () => {
    mockearBusquedas({
      venta: [anuncio({ portalId: 'v1' })],
      alquiler: [
        anuncio({ portalId: 'a1', precio: 1000, metros: 100 }),
        anuncio({ portalId: 'a2', precio: null, metros: 100 }),
      ],
    });

    return calcularRentabilidadZona('Cáceres').then((resultado) => {
      expect(resultado.numComparablesAlquilerTotal).toBe(1);
      expect(resultado.medianaAlquilerM2).toBe(10);
    });
  });

  it('si un portal falla por completo, se loguea y se sigue con lo que aporte el otro', () => {
    fotocasaBuscar.mockImplementation((criterios: CriteriosPortal) => {
      if (criterios.operacion === 'venta') throw new Error('Fotocasa respondió 403');
      return Promise.resolve([]);
    });
    pisosBuscar.mockImplementation((criterios: CriteriosPortal) => {
      if (criterios.operacion === 'venta') return Promise.resolve([anuncio({ portalId: 'p1', portal: 'pisos' })]);
      return Promise.resolve([]);
    });

    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    return calcularRentabilidadZona('Cáceres', log).then((resultado) => {
      expect(resultado.listings).toHaveLength(1);
      expect(resultado.listings[0].portal).toBe('pisos');
      expect(log.warn).toHaveBeenCalled();
    });
  });

  it('sin ningún anuncio en venta, avisa explícitamente en vez de devolver una lista vacía sin explicación', () => {
    mockearBusquedas({ venta: [], alquiler: [] });

    return calcularRentabilidadZona('Zona Vacía').then((resultado) => {
      expect(resultado.listings).toHaveLength(0);
      expect(resultado.avisos.some((a) => /anuncios en venta/.test(a))).toBe(true);
    });
  });
});
