import { describe, it, expect } from 'vitest';
import { calcularRankingRentabilidad, type ParametrosFinanciacion } from './rentabilidadZona';
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
