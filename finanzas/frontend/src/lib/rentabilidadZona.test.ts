import { describe, it, expect } from 'vitest';
import {
  calcularRankingRentabilidad,
  formatearDesviacionVenta,
  etiquetaAlquilerEstimado,
  type ParametrosFinanciacion,
} from './rentabilidadZona';
import type { RentabilidadZonaListing } from '../services/api';

const PARAMETROS: ParametrosFinanciacion = {
  entradaPct: 20,
  gastosCompraPct: 10,
  tinHipotecaPct: 3,
  plazoHipotecaAnios: 25,
  ibiAnual: 0,
  comunidadMensual: 0,
  seguroHogarAnual: 0,
  mantenimientoPctAnual: 1,
  gestoriaPctAlquiler: 0,
  tasaVacioPct: 5,
  umbralRentabilidadAceptablePct: 5,
};

function listing(overrides: Partial<RentabilidadZonaListing> = {}): RentabilidadZonaListing {
  return {
    titulo: 'Piso',
    url: 'https://example.com/1',
    portal: 'fotocasa',
    precio: 150_000,
    metros: 100,
    habitaciones: 3,
    ubicacion: 'Cáceres',
    imagenUrl: null,
    latitud: 39.4699,
    longitud: -0.3763,
    alquilerMensualEstimado: 800,
    numComparablesAlquiler: 10,
    confianza: 'alta',
    desviacionVsMedianaVentaPct: null,
    ...overrides,
  };
}

describe('calcularRankingRentabilidad', () => {
  it('ordena de mayor a menor rentabilidad neta sobre inversión', () => {
    const peor = listing({ url: 'peor', alquilerMensualEstimado: 400 });
    const mejor = listing({ url: 'mejor', alquilerMensualEstimado: 1200 });

    const ranking = calcularRankingRentabilidad([peor, mejor], PARAMETROS);

    expect(ranking.map((r) => r.listing.url)).toEqual(['mejor', 'peor']);
    expect(ranking[0].resultado?.rentabilidadNetaSobreInversionPct).toBeGreaterThan(
      ranking[1].resultado?.rentabilidadNetaSobreInversionPct ?? Infinity,
    );
  });

  it('recalcula al instante con parámetros distintos, sin tocar los listings de entrada', () => {
    const l = listing();
    const conEntradaBaja = calcularRankingRentabilidad([l], { ...PARAMETROS, entradaPct: 10 });
    const conEntradaAlta = calcularRankingRentabilidad([l], { ...PARAMETROS, entradaPct: 50 });

    expect(conEntradaBaja[0].resultado?.inversionInicial).not.toBe(conEntradaAlta[0].resultado?.inversionInicial);
  });

  it('un listing sin alquilerMensualEstimado va al final con resultado null, no se descarta', () => {
    const sinDato = listing({ url: 'sin-dato', alquilerMensualEstimado: null });
    const conDato = listing({ url: 'con-dato' });

    const ranking = calcularRankingRentabilidad([sinDato, conDato], PARAMETROS);

    expect(ranking).toHaveLength(2);
    expect(ranking[ranking.length - 1].listing.url).toBe('sin-dato');
    expect(ranking[ranking.length - 1].resultado).toBeNull();
  });

  it('una lista vacía devuelve un ranking vacío', () => {
    expect(calcularRankingRentabilidad([], PARAMETROS)).toEqual([]);
  });

  it('un gasto de reforma por listing solo afecta a la rentabilidad de ESE listing', () => {
    const a = listing({ url: 'a', precio: 100_000, alquilerMensualEstimado: 800 });
    const b = listing({ url: 'b', precio: 100_000, alquilerMensualEstimado: 800 });

    const sinReforma = calcularRankingRentabilidad([a, b], PARAMETROS);
    const conReformaEnA = calcularRankingRentabilidad([a, b], PARAMETROS, { a: 30_000 });

    const bSinReforma = sinReforma.find((r) => r.listing.url === 'b');
    const bConReformaEnA = conReformaEnA.find((r) => r.listing.url === 'b');
    expect(bConReformaEnA?.resultado?.rentabilidadNetaSobreInversionPct).toBe(
      bSinReforma?.resultado?.rentabilidadNetaSobreInversionPct,
    );

    const aSinReforma = sinReforma.find((r) => r.listing.url === 'a');
    const aConReforma = conReformaEnA.find((r) => r.listing.url === 'a');
    expect(aConReforma?.resultado?.rentabilidadNetaSobreInversionPct).not.toBe(
      aSinReforma?.resultado?.rentabilidadNetaSobreInversionPct,
    );
    // Un gasto de reforma alto empeora la rentabilidad de A y cambia el orden.
    expect(conReformaEnA[0].listing.url).toBe('b');
  });
});

describe('formatearDesviacionVenta', () => {
  it('antepone "+" a una desviación positiva (por encima de la mediana)', () => {
    expect(formatearDesviacionVenta(12.345)).toBe('+12.3% vs. mediana de la zona');
  });

  it('no antepone signo a una desviación negativa (el propio número ya lo lleva)', () => {
    expect(formatearDesviacionVenta(-8.2)).toBe('-8.2% vs. mediana de la zona');
  });

  it('una desviación de 0 no lleva signo "+"', () => {
    expect(formatearDesviacionVenta(0)).toBe('0.0% vs. mediana de la zona');
  });
});

describe('etiquetaAlquilerEstimado', () => {
  it('en modo alquiler_completo siempre dice "Alquiler estimado"', () => {
    expect(etiquetaAlquilerEstimado('alquiler_completo', 3)).toBe('Alquiler estimado');
    expect(etiquetaAlquilerEstimado('alquiler_completo', null)).toBe('Alquiler estimado');
  });

  it('en modo habitaciones incluye el número de habitaciones', () => {
    expect(etiquetaAlquilerEstimado('habitaciones', 3)).toBe('Ingreso estimado (3 habitaciones)');
  });

  it('en modo habitaciones sin dato de habitaciones cae a un texto genérico', () => {
    expect(etiquetaAlquilerEstimado('habitaciones', null)).toBe('Ingreso estimado');
  });
});
