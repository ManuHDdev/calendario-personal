import { describe, it, expect } from 'vitest';
import {
  parsearPrecio,
  extraerMetros,
  extraerHabitaciones,
  extraerBanos,
  extraerPlanta,
  tieneAscensor,
  tieneGaraje,
  tieneTerraza,
  slugificar,
  normalizarTexto,
} from './normalizar';

describe('parsearPrecio', () => {
  it('lee el punto como separador de millares, no como decimal', () => {
    // Este es EL error caro del formato español: 145.000 son ciento cuarenta
    // y cinco mil, y confundirlo metería en el feed pisos de 145 €.
    expect(parsearPrecio('145.000 €')).toBe(145000);
    expect(parsearPrecio('1.250.000€')).toBe(1250000);
  });

  it('lee la coma como decimal', () => {
    expect(parsearPrecio('1.234,56 €')).toBe(1234.56);
    expect(parsearPrecio('99,99')).toBe(99.99);
  });

  it('acepta números ya parseados y rechaza lo que no es un importe', () => {
    expect(parsearPrecio(145000)).toBe(145000);
    expect(parsearPrecio('Consultar precio')).toBeNull();
    expect(parsearPrecio(null)).toBeNull();
    expect(parsearPrecio('')).toBeNull();
  });
});

describe('extraerMetros', () => {
  it('reconoce las formas habituales de escribir la superficie', () => {
    expect(extraerMetros('Piso de 90 m2 en el centro')).toBe(90);
    expect(extraerMetros('Precioso ático 75m²')).toBe(75);
    expect(extraerMetros('Vivienda de 120 metros cuadrados')).toBe(120);
    expect(extraerMetros('Chalet 250 mts')).toBe(250);
  });

  it('descarta valores que no pueden ser la superficie de una vivienda', () => {
    // "1.800 €/m2" y "3 m2 de trastero" son números reales del anuncio que
    // significan otra cosa; colarlos como superficie rompería el filtro.
    expect(extraerMetros('Trastero de 3 m2')).toBeNull();
    expect(extraerMetros('Finca de 5000 m2')).toBeNull();
  });

  it('devuelve null cuando no se menciona', () => {
    expect(extraerMetros('Piso reformado con mucha luz')).toBeNull();
  });
});

describe('extraerHabitaciones y extraerBanos', () => {
  it('reconoce habitaciones y dormitorios en sus abreviaturas', () => {
    expect(extraerHabitaciones('Piso de 3 habitaciones')).toBe(3);
    expect(extraerHabitaciones('2 dormitorios, exterior')).toBe(2);
    expect(extraerHabitaciones('4 hab / 2 baños')).toBe(4);
    expect(extraerHabitaciones('Estudio sin separaciones')).toBeNull();
  });

  it('reconoce baños con y sin tilde, y los aseos', () => {
    expect(extraerBanos('3 hab y 2 baños')).toBe(2);
    expect(extraerBanos('1 bano completo')).toBe(1);
    expect(extraerBanos('2 aseos')).toBe(2);
  });
});

describe('extraerPlanta', () => {
  it('lee plantas numeradas y con nombre', () => {
    expect(extraerPlanta('3ª planta con ascensor')).toBe('3ª');
    expect(extraerPlanta('Planta 5 exterior')).toBe('5ª');
    // Los anuncios reales escriben el ordinal con letra tanto como con cifra.
    expect(extraerPlanta('Tercera planta exterior')).toBe('3ª');
    expect(extraerPlanta('Septimo piso, septima planta')).toBe('7ª');
    expect(extraerPlanta('Ático con terraza')).toBe('Ático');
    expect(extraerPlanta('Bajo con patio')).toBe('Bajo');
    expect(extraerPlanta('Piso luminoso')).toBeNull();
  });
});

describe('características con negación', () => {
  it('distingue "no lo dice" de "dice que no lo tiene"', () => {
    // Es la distinción que decide si un piso se filtra: null pasa el filtro,
    // false lo descarta. Tratar el silencio como false perdería la mayoría
    // de anuncios válidos, porque casi ninguno enumera lo que le falta.
    expect(tieneAscensor('Piso con ascensor')).toBe(true);
    expect(tieneAscensor('Tercero sin ascensor')).toBe(false);
    expect(tieneAscensor('Piso reformado y luminoso')).toBeNull();
  });

  it('reconoce la negación aunque haya palabras por medio', () => {
    expect(tieneGaraje('Vivienda sin plaza de garaje')).toBe(false);
    expect(tieneGaraje('Incluye plaza de garaje')).toBe(true);
    expect(tieneGaraje('No dispone de parking')).toBe(false);
  });

  it('reconoce terraza y sus sinónimos', () => {
    expect(tieneTerraza('Ático con terraza de 20m')).toBe(true);
    expect(tieneTerraza('Piso sin terraza')).toBe(false);
    expect(tieneTerraza('Piso interior')).toBeNull();
  });
});

describe('normalizarTexto y slugificar', () => {
  it('quita acentos para poder buscar patrones una sola vez', () => {
    expect(normalizarTexto('Ático con Jardín')).toBe('atico con jardin');
  });

  it('convierte una zona en el slug que usan los portales en su URL', () => {
    expect(slugificar('Ciudad Real')).toBe('ciudad-real');
    expect(slugificar('  Alcalá de Henares ')).toBe('alcala-de-henares');
    expect(slugificar('A Coruña')).toBe('a-coruna');
  });
});
