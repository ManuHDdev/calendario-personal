import { describe, it, expect } from 'vitest';
import {
  construirUpsertFilaCapitalQuery,
  calcularPrecioMedioM2,
  criteriosParaCapital,
  type FilaCapital,
} from './capitalScraper';
import type { AnuncioCrudo } from '../portales/types';

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
    ubicacion: 'Madrid',
    latitud: null,
    longitud: null,
    imagenUrl: null,
    ...overrides,
  };
}

describe('construirUpsertFilaCapitalQuery', () => {
  const fila: FilaCapital = {
    capital: 'Madrid',
    provincia: 'Madrid',
    portal: 'fotocasa',
    fechaCaptura: '2026-09-17',
    precioM2Medio: 3200.5,
    numAnuncios: 28,
  };

  it('usa ON CONFLICT sobre (capital, portal, fecha_captura) para no duplicar', () => {
    const { text } = construirUpsertFilaCapitalQuery(fila);
    expect(text).toMatch(/ON CONFLICT \(capital, portal, fecha_captura\)/);
    expect(text).toMatch(/DO UPDATE SET/);
  });

  it('capturar dos veces el mismo día produce la misma query parametrizada (idempotente)', () => {
    const primera = construirUpsertFilaCapitalQuery(fila);
    const segunda = construirUpsertFilaCapitalQuery({ ...fila });
    expect(primera.text).toBe(segunda.text);
    expect(primera.values).toEqual(segunda.values);
  });

  it('actualiza precio y número de anuncios si se relanza el mismo día', () => {
    const { text } = construirUpsertFilaCapitalQuery(fila);
    expect(text).toMatch(/precio_m2_medio = EXCLUDED\.precio_m2_medio/);
    expect(text).toMatch(/num_anuncios = EXCLUDED\.num_anuncios/);
  });
});

describe('criteriosParaCapital', () => {
  it('siempre busca en venta — el scraper de capitales no toca alquiler', () => {
    const criterios = criteriosParaCapital('Madrid');
    expect(criterios.operacion).toBe('venta');
    expect(criterios.tipo).toBe('vivienda');
    expect(criterios.ubicacion).toBe('Madrid');
  });
});

describe('calcularPrecioMedioM2', () => {
  it('usa la mediana (con dos valores, coincide con la media) solo de anuncios con precio y metros', () => {
    const anuncios = [
      anuncio({ portalId: '1', precio: 100_000, metros: 100 }), // 1000 €/m²
      anuncio({ portalId: '2', precio: 200_000, metros: 100 }), // 2000 €/m²
    ];
    const resultado = calcularPrecioMedioM2(anuncios);
    expect(resultado).not.toBeNull();
    expect(resultado?.precioM2Medio).toBe(1500);
    expect(resultado?.numAnuncios).toBe(2);
  });

  it('un único anuncio con precio/m² disparatado no arrastra el resultado (mediana, no media)', () => {
    // Caso real visto en local: un anuncio de Fotocasa en Jaén a ~15.800 €/m²
    // entre ~30 anuncios normales rondando 1.800-2.000 €/m². Con una media
    // aritmética ese único atípico dispararía el resultado a >9.000 €/m²;
    // con la mediana, el resultado se queda dentro del rango real.
    const normales = Array.from({ length: 29 }, (_, i) =>
      anuncio({ portalId: `normal-${i}`, precio: 180_000, metros: 100 }), // 1800 €/m²
    );
    const atipico = anuncio({ portalId: 'outlier', precio: 1_580_000, metros: 100 }); // 15.800 €/m²
    const resultado = calcularPrecioMedioM2([...normales, atipico]);
    expect(resultado?.precioM2Medio).toBe(1800);
    expect(resultado?.numAnuncios).toBe(30);
  });

  it('un anuncio sin metros no cuenta para la media pero no descarta el resto', () => {
    const anuncios = [
      anuncio({ portalId: '1', precio: 100_000, metros: 100 }), // 1000 €/m²
      anuncio({ portalId: '2', precio: 50_000, metros: null }), // sin m²: no cuenta
    ];
    const resultado = calcularPrecioMedioM2(anuncios);
    expect(resultado?.precioM2Medio).toBe(1000);
    expect(resultado?.numAnuncios).toBe(1);
  });

  it('un anuncio sin precio no cuenta para la media', () => {
    const anuncios = [
      anuncio({ portalId: '1', precio: 100_000, metros: 100 }),
      anuncio({ portalId: '2', precio: null, metros: 80 }),
    ];
    const resultado = calcularPrecioMedioM2(anuncios);
    expect(resultado?.numAnuncios).toBe(1);
  });

  it('un precio 0 o negativo no cuenta (mismo centinela "sin precio" que el resto de la app)', () => {
    const anuncios = [anuncio({ portalId: '1', precio: 0, metros: 100 })];
    expect(calcularPrecioMedioM2(anuncios)).toBeNull();
  });

  it('si ningún anuncio califica, devuelve null en vez de una media de 0', () => {
    const anuncios = [
      anuncio({ portalId: '1', precio: null, metros: 100 }),
      anuncio({ portalId: '2', precio: 100_000, metros: null }),
    ];
    expect(calcularPrecioMedioM2(anuncios)).toBeNull();
  });

  it('una lista vacía devuelve null', () => {
    expect(calcularPrecioMedioM2([])).toBeNull();
  });
});
