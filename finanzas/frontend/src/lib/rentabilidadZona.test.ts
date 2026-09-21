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
});
