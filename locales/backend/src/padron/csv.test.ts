import { describe, it, expect } from 'vitest';
import { parsearCsv, partirLinea, detectarSeparador, campo, numero, normalizarCabecera } from './csv';

describe('detectarSeparador', () => {
  it('detecta el punto y coma de los CSV españoles', () => {
    expect(detectarSeparador('nombre;direccion;lat;lon')).toBe(';');
  });
  it('detecta la coma', () => {
    expect(detectarSeparador('nombre,direccion,lat,lon')).toBe(',');
  });
  it('no se confunde con comas dentro de un campo entrecomillado', () => {
    expect(detectarSeparador('"Apellidos, Nombre";direccion;lat')).toBe(';');
  });
});

describe('partirLinea', () => {
  it('respeta las comillas', () => {
    expect(partirLinea('"Calle Mayor, 12";Madrid', ';')).toEqual(['Calle Mayor, 12', 'Madrid']);
  });
  it('entiende las comillas escapadas', () => {
    expect(partirLinea('"Farmacia ""La Paz""";Madrid', ';')).toEqual(['Farmacia "La Paz"', 'Madrid']);
  });
  it('conserva los campos vacíos', () => {
    expect(partirLinea('a;;c', ';')).toEqual(['a', '', 'c']);
  });
});

describe('parsearCsv', () => {
  it('se come el BOM de Excel', () => {
    const r = parsearCsv('﻿nombre;lat\nFarmacia A;40.4');
    expect(r.claves).toEqual(['nombre', 'lat']);
    expect(r.filas[0].nombre).toBe('Farmacia A');
  });

  it('normaliza acentos y mayúsculas en las cabeceras', () => {
    const r = parsearCsv('Código Postal;DIRECCIÓN\n28013;Calle Mayor');
    expect(r.claves).toEqual(['codigopostal', 'direccion']);
  });

  it('un CSV vacío no revienta', () => {
    expect(parsearCsv('').filas).toEqual([]);
  });

  it('tolera líneas con menos columnas que la cabecera', () => {
    const r = parsearCsv('a;b;c\n1;2');
    expect(r.filas[0]).toEqual({ a: '1', b: '2', c: '' });
  });
});

describe('campo', () => {
  const fila = parsearCsv('Nombre;LATITUD\nFarmacia A;40.4').filas[0];

  it('encuentra una columna por cualquiera de sus alias', () => {
    expect(campo(fila, 'nombre_farmacia', 'nombre')).toBe('Farmacia A');
    expect(campo(fila, 'latitud')).toBe('40.4');
  });

  it('devuelve null si ningún alias existe', () => {
    expect(campo(fila, 'telefono', 'movil')).toBeNull();
  });
});

describe('numero', () => {
  it('lee decimales con punto', () => {
    expect(numero('-3.7035')).toBeCloseTo(-3.7035);
  });
  it('lee decimales con coma española', () => {
    expect(numero('40,4169')).toBeCloseTo(40.4169);
  });
  it('lee miles con punto y decimal con coma', () => {
    expect(numero('1.234,56')).toBeCloseTo(1234.56);
  });
  it('devuelve null ante basura', () => {
    expect(numero('no es un número')).toBeNull();
    expect(numero(null)).toBeNull();
  });
});

describe('normalizarCabecera', () => {
  it('quita acentos, espacios y signos', () => {
    expect(normalizarCabecera('Código_Postal (nuevo)')).toBe('codigopostalnuevo');
  });
});
