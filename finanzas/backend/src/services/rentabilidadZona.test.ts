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
function mockearBusquedas(porOperacion: {
  venta?: AnuncioCrudo[];
  alquiler?: AnuncioCrudo[];
  compartir?: AnuncioCrudo[];
}): void {
  const impl = (criterios: CriteriosPortal) => {
    if (criterios.operacion === 'venta') return Promise.resolve(porOperacion.venta ?? []);
    if (criterios.operacion === 'compartir') return Promise.resolve(porOperacion.compartir ?? []);
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

  it('expone latitud/longitud del anuncio en venta cuando el portal las da, y null cuando no', () => {
    mockearBusquedas({
      venta: [
        anuncio({ portalId: 'v1', latitud: 39.4699, longitud: -0.3763 }),
        anuncio({ portalId: 'v2', url: 'https://example.com/2', latitud: null, longitud: null }),
      ],
      alquiler: [anuncio({ portalId: 'a1', precio: 1000, metros: 100 })],
    });

    return calcularRentabilidadZona('Cáceres').then((resultado) => {
      expect(resultado.listings).toHaveLength(2);
      const conCoords = resultado.listings.find((l) => l.url === 'https://example.com/1');
      const sinCoords = resultado.listings.find((l) => l.url === 'https://example.com/2');
      expect(conCoords?.latitud).toBe(39.4699);
      expect(conCoords?.longitud).toBe(-0.3763);
      expect(sinCoords?.latitud).toBeNull();
      expect(sinCoords?.longitud).toBeNull();
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

  describe('AVM: medianaVentaM2 y desviacionVsMedianaVentaPct', () => {
    it('calcula la mediana de €/m² de venta y la desviación de cada anuncio con el signo correcto', () => {
      mockearBusquedas({
        // €/m²: 1000, 2000, 3000 -> mediana 2000
        venta: [
          anuncio({ portalId: 'v1', precio: 100_000, metros: 100 }), // 1000 €/m² -> -50%
          anuncio({ portalId: 'v2', url: 'https://example.com/2', precio: 200_000, metros: 100 }), // 2000 €/m² -> 0%
          anuncio({ portalId: 'v3', url: 'https://example.com/3', precio: 300_000, metros: 100 }), // 3000 €/m² -> +50%
        ],
        alquiler: [anuncio({ portalId: 'a1', precio: 1000, metros: 100 })],
      });

      return calcularRentabilidadZona('Cáceres').then((resultado) => {
        expect(resultado.medianaVentaM2).toBe(2000);
        expect(resultado.numComparablesVentaTotal).toBe(3);

        const l1 = resultado.listings.find((l) => l.url === 'https://example.com/1');
        const l2 = resultado.listings.find((l) => l.url === 'https://example.com/2');
        const l3 = resultado.listings.find((l) => l.url === 'https://example.com/3');

        // Anuncio por debajo de la mediana -> deviación negativa (posible chollo).
        expect(l1?.desviacionVsMedianaVentaPct).toBeCloseTo(-50, 2);
        // Anuncio exactamente en la mediana -> deviación ≈ 0.
        expect(l2?.desviacionVsMedianaVentaPct).toBeCloseTo(0, 2);
        // Anuncio por encima de la mediana -> deviación positiva (posible sobreprecio).
        expect(l3?.desviacionVsMedianaVentaPct).toBeCloseTo(50, 2);
      });
    });

    it('con cero o un anuncio en venta, medianaVentaM2 es null y hay un aviso de valoración no disponible', () => {
      mockearBusquedas({ venta: [], alquiler: [] });

      return calcularRentabilidadZona('Zona Vacía').then((resultado) => {
        expect(resultado.medianaVentaM2).toBeNull();
        expect(resultado.numComparablesVentaTotal).toBe(0);
        expect(resultado.avisos.some((a) => /valorar si el precio/.test(a))).toBe(true);
      });
    });

    it('con un único anuncio en venta, medianaVentaM2 es ese mismo €/m² y la desviación de ese anuncio es 0', () => {
      mockearBusquedas({
        venta: [anuncio({ portalId: 'v1', precio: 150_000, metros: 100 })], // 1500 €/m²
        alquiler: [],
      });

      return calcularRentabilidadZona('Cáceres').then((resultado) => {
        expect(resultado.medianaVentaM2).toBe(1500);
        expect(resultado.numComparablesVentaTotal).toBe(1);
        expect(resultado.listings[0].desviacionVsMedianaVentaPct).toBeCloseTo(0, 2);
      });
    });

    it('un anuncio en venta sin precio/metros no cuenta como comparable de venta (se excluye del listado igualmente)', () => {
      mockearBusquedas({
        venta: [
          anuncio({ portalId: 'v1', precio: 100_000, metros: 100 }),
          anuncio({ portalId: 'v2', precio: null, metros: 80 }),
        ],
        alquiler: [],
      });

      return calcularRentabilidadZona('Cáceres').then((resultado) => {
        expect(resultado.numComparablesVentaTotal).toBe(1);
        expect(resultado.listings).toHaveLength(1);
      });
    });
  });

  describe('modo (alquiler_completo por defecto vs. habitaciones)', () => {
    it('sin modo (u omitido) se comporta byte a byte igual que antes y devuelve modo: "alquiler_completo"', () => {
      mockearBusquedas({
        venta: [anuncio({ portalId: 'v1', precio: 150_000, metros: 100 })],
        alquiler: [
          anuncio({ portalId: 'a1', precio: 1000, metros: 100 }),
          anuncio({ portalId: 'a2', precio: 1200, metros: 100 }),
        ],
      });

      return calcularRentabilidadZona('Cáceres').then((resultado) => {
        expect(resultado.modo).toBe('alquiler_completo');
        expect(resultado.medianaAlquilerM2).toBe(11);
        expect(resultado.listings[0].alquilerMensualEstimado).toBe(1100);
      });
    });

    it('modo "habitaciones" busca comparables de "compartir" y estima con mediana de precio × habitaciones', () => {
      mockearBusquedas({
        venta: [anuncio({ portalId: 'v1', precio: 150_000, metros: 100, habitaciones: 3 })],
        // mediana de 300 y 340 € -> 320 €/habitación/mes
        compartir: [
          anuncio({ portalId: 'c1', precio: 300, metros: 389 }),
          anuncio({ portalId: 'c2', precio: 340, metros: 389 }),
        ],
      });

      return calcularRentabilidadZona('Cáceres', undefined, 'habitaciones').then((resultado) => {
        expect(resultado.modo).toBe('habitaciones');
        expect(resultado.medianaAlquilerM2).toBe(320);
        expect(resultado.numComparablesAlquilerTotal).toBe(2);
        expect(resultado.listings).toHaveLength(1);
        expect(resultado.listings[0].alquilerMensualEstimado).toBe(960); // 320 * 3 habitaciones
      });
    });

    it('en modo habitaciones, un anuncio en venta con habitaciones null o 0 se excluye (no se puede estimar)', () => {
      mockearBusquedas({
        venta: [
          anuncio({ portalId: 'v1', precio: 150_000, metros: 100, habitaciones: 3 }),
          anuncio({ portalId: 'v2', url: 'https://example.com/2', precio: 100_000, metros: 80, habitaciones: null }),
          anuncio({ portalId: 'v3', url: 'https://example.com/3', precio: 90_000, metros: 70, habitaciones: 0 }),
        ],
        compartir: [anuncio({ portalId: 'c1', precio: 300, metros: 389 })],
      });

      return calcularRentabilidadZona('Cáceres', undefined, 'habitaciones').then((resultado) => {
        expect(resultado.listings.map((l) => l.url)).toEqual(['https://example.com/1']);
      });
    });

    it('en modo habitaciones sin comparables de "compartir", el estimado es null y hay un aviso específico', () => {
      mockearBusquedas({
        venta: [anuncio({ portalId: 'v1', precio: 150_000, metros: 100, habitaciones: 3 })],
        compartir: [],
      });

      return calcularRentabilidadZona('Cáceres', undefined, 'habitaciones').then((resultado) => {
        expect(resultado.medianaAlquilerM2).toBeNull();
        expect(resultado.listings[0].alquilerMensualEstimado).toBeNull();
        expect(resultado.avisos.some((a) => /alquiler por habitaciones/.test(a))).toBe(true);
      });
    });
  });

  describe('modo "flip" (comprar, reformar, vender)', () => {
    it('no busca comparables de alquiler ni de "compartir" en absoluto (petición más ligera)', () => {
      // Limpia el historial de llamadas de tests anteriores del mismo fichero
      // (los mocks son de módulo, no se resetean solos entre tests) — solo
      // interesan las llamadas que haga ESTA búsqueda.
      fotocasaBuscar.mockClear();
      pisosBuscar.mockClear();
      mockearBusquedas({
        venta: [anuncio({ portalId: 'v1', precio: 100_000, metros: 100 })],
        // Si el modo flip llamara a buscarEnPortales para alquiler/compartir,
        // este mock (por operación) seguiría devolviendo [] igualmente, así
        // que la prueba real está en la aserción de llamadas de abajo.
      });

      return calcularRentabilidadZona('Cáceres', undefined, 'flip').then((resultado) => {
        expect(resultado.modo).toBe('flip');
        expect(resultado.medianaAlquilerM2).toBeNull();
        expect(resultado.numComparablesAlquilerTotal).toBe(0);
        expect(resultado.listings[0].alquilerMensualEstimado).toBeNull();
        // Solo se pidió 'venta': ni fotocasaBuscar ni pisosBuscar deben haberse
        // llamado con operacion 'alquiler' ni 'compartir'.
        const operacionesPedidas = [...fotocasaBuscar.mock.calls, ...pisosBuscar.mock.calls].map(
          (call) => (call[0] as CriteriosPortal).operacion,
        );
        expect(operacionesPedidas.every((op) => op === 'venta')).toBe(true);
      });
    });

    it('sigue calculando medianaVentaM2 y desviacionVsMedianaVentaPct exactamente igual que los otros modos', () => {
      mockearBusquedas({
        venta: [
          anuncio({ portalId: 'v1', precio: 100_000, metros: 100 }), // 1000 €/m²
          anuncio({ portalId: 'v2', url: 'https://example.com/2', precio: 300_000, metros: 100 }), // 3000 €/m²
        ],
      });

      return calcularRentabilidadZona('Cáceres', undefined, 'flip').then((resultado) => {
        expect(resultado.medianaVentaM2).toBe(2000);
        expect(resultado.numComparablesVentaTotal).toBe(2);
        const l1 = resultado.listings.find((l) => l.url === 'https://example.com/1');
        expect(l1?.desviacionVsMedianaVentaPct).toBeCloseTo(-50, 2);
      });
    });

    it('sin comparables de venta suficientes, el aviso menciona la estimación de venta para el flip (no "por encima/debajo del mercado")', () => {
      mockearBusquedas({ venta: [] });

      return calcularRentabilidadZona('Zona Vacía', undefined, 'flip').then((resultado) => {
        expect(resultado.medianaVentaM2).toBeNull();
        expect(resultado.avisos.some((a) => /estimar el precio de venta para el flip/.test(a))).toBe(true);
      });
    });

    it('no genera ningún aviso de "comparables de alquiler" (no aplica a este modo)', () => {
      mockearBusquedas({ venta: [anuncio({ portalId: 'v1', precio: 100_000, metros: 100 })] });

      return calcularRentabilidadZona('Cáceres', undefined, 'flip').then((resultado) => {
        expect(resultado.avisos.some((a) => /comparables de alquiler/.test(a))).toBe(false);
      });
    });
  });
});
