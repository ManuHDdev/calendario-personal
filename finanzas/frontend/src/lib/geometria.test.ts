import { describe, it, expect } from 'vitest';
import { puntoDentroDePoligono, type Punto } from './geometria';

// Cuadrado simple: lat 0..10, lng 0..10.
const CUADRADO: Punto[] = [
  [0, 0],
  [0, 10],
  [10, 10],
  [10, 0],
];

describe('puntoDentroDePoligono', () => {
  it('un punto claramente dentro del polígono devuelve true', () => {
    expect(puntoDentroDePoligono([5, 5], CUADRADO)).toBe(true);
  });

  it('un punto claramente fuera del polígono devuelve false', () => {
    expect(puntoDentroDePoligono([20, 20], CUADRADO)).toBe(false);
    expect(puntoDentroDePoligono([-5, 5], CUADRADO)).toBe(false);
  });

  it('un punto sobre un vértice del polígono no lanza y devuelve un booleano', () => {
    // Caso borde documentado: no se garantiza dentro o fuera, solo que no
    // rompe y devuelve un boolean determinista para esa misma entrada.
    const resultado = puntoDentroDePoligono([0, 0], CUADRADO);
    expect(typeof resultado).toBe('boolean');
    expect(puntoDentroDePoligono([0, 0], CUADRADO)).toBe(resultado);
  });

  it('un punto sobre una arista del polígono no lanza y devuelve un booleano', () => {
    const resultado = puntoDentroDePoligono([5, 0], CUADRADO);
    expect(typeof resultado).toBe('boolean');
    expect(puntoDentroDePoligono([5, 0], CUADRADO)).toBe(resultado);
  });

  it('un polígono con menos de 3 vértices nunca contiene nada', () => {
    expect(puntoDentroDePoligono([5, 5], [])).toBe(false);
    expect(puntoDentroDePoligono([5, 5], [[0, 0]])).toBe(false);
    expect(
      puntoDentroDePoligono(
        [5, 5],
        [
          [0, 0],
          [10, 10],
        ],
      ),
    ).toBe(false);
  });

  it('funciona con un polígono no convexo (forma de L)', () => {
    const formaL: Punto[] = [
      [0, 0],
      [0, 10],
      [5, 10],
      [5, 5],
      [10, 5],
      [10, 0],
    ];
    // Dentro del brazo vertical de la L.
    expect(puntoDentroDePoligono([2, 8], formaL)).toBe(true);
    // Dentro del brazo horizontal de la L.
    expect(puntoDentroDePoligono([8, 2], formaL)).toBe(true);
    // En el hueco de la L (esquina superior derecha, fuera de ambos brazos).
    expect(puntoDentroDePoligono([8, 8], formaL)).toBe(false);
  });

  it('no depende de que se repita el primer vértice al final', () => {
    const conCierreExplicito: Punto[] = [...CUADRADO, CUADRADO[0]];
    expect(puntoDentroDePoligono([5, 5], conCierreExplicito)).toBe(true);
  });
});
