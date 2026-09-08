import { describe, it, expect } from 'vitest';
import {
  parsearPrecio,
  extraerSuperficieLocal,
  extraerFacturacion,
  esPieDeCalle,
  slugificar,
  normalizarTexto,
  decodificarEntidades,
  esCapitalDeProvincia,
  ubicacionCoincide,
} from './normalizar';

describe('parsearPrecio', () => {
  it('lee el punto como separador de millares y la coma como decimal', () => {
    expect(parsearPrecio('195.000 €')).toBe(195000);
    expect(parsearPrecio('1.250.000€')).toBe(1250000);
    expect(parsearPrecio('1.234,56 €')).toBe(1234.56);
    expect(parsearPrecio('Consultar')).toBeNull();
  });
});

describe('extraerSuperficieLocal', () => {
  it('acepta la horquilla ancha de un local comercial [10, 5000] m²', () => {
    expect(extraerSuperficieLocal('Local de 12 m2 en esquina')).toBe(12);
    expect(extraerSuperficieLocal('Nave de 3.000 m²')).toBe(3000);
    expect(extraerSuperficieLocal('Local diáfano 250 metros cuadrados')).toBe(250);
  });

  it('descarta lo que no puede ser una superficie', () => {
    expect(extraerSuperficieLocal('9 m2 de escaparate')).toBeNull();
    expect(extraerSuperficieLocal('Terreno de 8000 m2')).toBeNull();
    expect(extraerSuperficieLocal('Local reformado con mucha luz')).toBeNull();
  });
});

describe('extraerFacturacion', () => {
  it('reconoce las formas del sector de escribir la cifra de negocio', () => {
    expect(extraerFacturacion('Facturación 620.000 € anuales')).toBe(620000);
    expect(extraerFacturacion('factura 780.000')).toBe(780000);
    expect(extraerFacturacion('VF 540.000 €')).toBe(540000);
    expect(extraerFacturacion('cifra de negocio de 1.200.000')).toBe(1200000);
  });

  it('entiende las escalas abreviadas', () => {
    expect(extraerFacturacion('facturación 1,2 millones')).toBe(1200000);
    expect(extraerFacturacion('facturación 620 k')).toBe(620000);
  });

  it('devuelve null si no se menciona', () => {
    expect(extraerFacturacion('Bonita farmacia en el centro')).toBeNull();
  });
});

describe('esPieDeCalle', () => {
  it('distingue "no lo dice" de "dice que sí/no"', () => {
    expect(esPieDeCalle('Local a pie de calle, gran escaparate')).toBe(true);
    expect(esPieDeCalle('Local en planta calle')).toBe(true);
    expect(esPieDeCalle('Oficina en primera planta')).toBe(false);
    expect(esPieDeCalle('Local en entreplanta')).toBe(false);
    expect(esPieDeCalle('Sótano diáfano')).toBe(false);
    expect(esPieDeCalle('Local reformado y luminoso')).toBeNull();
  });
});

describe('decodificarEntidades', () => {
  it('decodifica las entidades numéricas que sirven los portales', () => {
    expect(decodificarEntidades('Local en Avd. Espa&#xF1;a')).toBe('Local en Avd. España');
    expect(decodificarEntidades('120 m&#xB2;')).toBe('120 m²');
    expect(decodificarEntidades('60.000 &#8364;')).toBe('60.000 €');
    expect(decodificarEntidades('Locales &amp; Naves')).toBe('Locales & Naves');
  });
});

describe('esCapitalDeProvincia', () => {
  it('reconoce la capital cuyo nombre a secas designa la provincia', () => {
    expect(esCapitalDeProvincia('Málaga')).toBe(true);
    expect(esCapitalDeProvincia('  badajoz ')).toBe(true);
    expect(esCapitalDeProvincia('Montijo')).toBe(false);
  });
});

describe('ubicacionCoincide', () => {
  it('compara parte a parte, sin aceptar otro municipio por contener la palabra', () => {
    expect(ubicacionCoincide('Centro (Cáceres Capital)', 'Cáceres')).toBe(true);
    expect(ubicacionCoincide('Casar de Cáceres', 'Cáceres')).toBe(false);
    expect(ubicacionCoincide('donde sea', '')).toBe(true);
    expect(ubicacionCoincide(null, 'Cáceres')).toBe(false);
  });
});

describe('slugificar y normalizarTexto', () => {
  it('produce el slug que usan los portales', () => {
    expect(slugificar('Ciudad Real')).toBe('ciudad-real');
    expect(slugificar('A Coruña')).toBe('a-coruna');
    expect(normalizarTexto('Local Diáfano')).toBe('local diafano');
  });
});
