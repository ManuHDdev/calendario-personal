import { describe, it, expect } from 'vitest';
import {
  calcularRankingRentabilidad,
  calcularRankingFlip,
  formatearDesviacionVenta,
  etiquetaAlquilerEstimado,
  type ParametrosFinanciacion,
  type ParametrosFlip,
} from './rentabilidadZona';
import type { RentabilidadZonaListing } from '../services/api';

const PARAMETROS_FLIP: ParametrosFlip = {
  gastosCompraPct: 10,
  gastosVentaPct: 5,
  umbralMargenAceptablePct: 20,
};

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

describe('calcularRankingFlip', () => {
  it('un flip rentable rankea primero que uno con margen bajo', () => {
    // medianaVentaM2 = 2000; barato: precio 100k/100m² -> venta estimada 200k;
    // caro: precio 180k/100m² -> venta estimada 200k también, pero con menos margen.
    const barato = listing({ url: 'barato', precio: 100_000, metros: 100 });
    const caro = listing({ url: 'caro', precio: 180_000, metros: 100 });

    const ranking = calcularRankingFlip([caro, barato], 2000, PARAMETROS_FLIP);

    expect(ranking.map((r) => r.listing.url)).toEqual(['barato', 'caro']);
    expect(ranking[0].resultado?.margenSobreInversionPct).toBeGreaterThan(
      ranking[1].resultado?.margenSobreInversionPct ?? Infinity,
    );
  });

  it('sin medianaVentaM2 de la zona, todos los listings van con resultado null (no se fabrica un precio de venta)', () => {
    const l = listing({ url: 'sin-avm' });

    const ranking = calcularRankingFlip([l], null, PARAMETROS_FLIP);

    expect(ranking).toHaveLength(1);
    expect(ranking[0].resultado).toBeNull();
  });

  it('con medianaVentaM2, precioVentaEstimado = medianaVentaM2 * metros (verificable a mano)', () => {
    // medianaVentaM2 = 1800, metros = 100 -> precioVentaEstimado = 180000
    // inversionTotal = 100000*1.10 + 0 = 110000
    // ingresoVentaNeto = 180000*0.95 = 171000
    // beneficioBruto = 61000 -> margen = 61000/110000*100 ≈ 55.45%
    const l = listing({ url: 'a', precio: 100_000, metros: 100 });

    const ranking = calcularRankingFlip([l], 1800, PARAMETROS_FLIP);

    expect(ranking[0].resultado?.margenSobreInversionPct).toBeCloseTo(55.45, 1);
  });

  it('un gasto de reforma por listing solo afecta a la rentabilidad de ESE listing (mismo mapa que el modo alquiler)', () => {
    const a = listing({ url: 'a', precio: 100_000, metros: 100 });
    const b = listing({ url: 'b', precio: 100_000, metros: 100 });

    const sinReforma = calcularRankingFlip([a, b], 2000, PARAMETROS_FLIP);
    const conReformaEnA = calcularRankingFlip([a, b], 2000, PARAMETROS_FLIP, { a: 50_000 });

    const bSinReforma = sinReforma.find((r) => r.listing.url === 'b');
    const bConReformaEnA = conReformaEnA.find((r) => r.listing.url === 'b');
    expect(bConReformaEnA?.resultado?.margenSobreInversionPct).toBe(bSinReforma?.resultado?.margenSobreInversionPct);

    const aSinReforma = sinReforma.find((r) => r.listing.url === 'a');
    const aConReforma = conReformaEnA.find((r) => r.listing.url === 'a');
    expect(aConReforma?.resultado?.margenSobreInversionPct).not.toBe(
      aSinReforma?.resultado?.margenSobreInversionPct,
    );
  });

  it('los gastos de compra se aplican SOLO al precio de compra, nunca a la reforma (verificable a mano)', () => {
    // Regresión: una implementación anterior sumaba la reforma al precio de
    // compra ANTES de aplicar gastosCompraPct, encareciendo la reforma con
    // un 10% de ITP/notaría que no le corresponde (eso se paga a un
    // contratista, no en la compraventa). precio 100k, reforma 30k, mediana
    // 2000€/m², metros 100 -> venta estimada 200000.
    // inversionTotal correcto = 100000*1.10 + 30000 = 140000 (NO (100000+30000)*1.10 = 143000)
    // ingresoVentaNeto = 200000*0.95 = 190000
    // beneficioBruto = 190000 - 140000 = 50000 -> margen = 50000/140000*100 ≈ 35.71%
    const l = listing({ url: 'a', precio: 100_000, metros: 100 });

    const ranking = calcularRankingFlip([l], 2000, PARAMETROS_FLIP, { a: 30_000 });

    expect(ranking[0].resultado?.margenSobreInversionPct).toBeCloseTo(35.71, 1);
  });

  it('una lista vacía devuelve un ranking vacío', () => {
    expect(calcularRankingFlip([], 2000, PARAMETROS_FLIP)).toEqual([]);
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
