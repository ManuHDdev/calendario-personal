import { describe, it, expect } from 'vitest';
import { distanciaKm } from './geo';
import { asignarCiudad, CIUDADES } from './ciudades';

describe('distanciaKm', () => {
  it('es 0 entre un punto y sí mismo', () => {
    expect(distanciaKm(39.47, -6.37, 39.47, -6.37)).toBe(0);
  });

  it('Cáceres–Mérida ronda los 70 km en línea recta', () => {
    const [caceres, , merida] = CIUDADES;
    const d = distanciaKm(caceres.latitud, caceres.longitud, merida.latitud, merida.longitud);
    expect(d).toBeGreaterThan(60);
    expect(d).toBeLessThan(80);
  });

  it('es simétrica', () => {
    expect(distanciaKm(38.9, -6.9, 39.4, -6.3)).toBeCloseTo(distanciaKm(39.4, -6.3, 38.9, -6.9), 9);
  });
});

describe('asignarCiudad', () => {
  it('asigna el centro de cada ciudad a sí misma con distancia ~0', () => {
    for (const c of CIUDADES) {
      const r = asignarCiudad(c.latitud, c.longitud);
      expect(r?.ciudad.slug).toBe(c.slug);
      expect(r?.distanciaKm).toBeLessThan(0.01);
    }
  });

  it('un punto a 10 km de Badajoz (A-5 hacia el este) pertenece a Badajoz', () => {
    expect(asignarCiudad(38.88, -6.85)?.ciudad.slug).toBe('badajoz');
  });

  it('un punto lejos de todas (Madrid) no se asigna a ninguna', () => {
    expect(asignarCiudad(40.4168, -3.7038)).toBeNull();
  });

  it('un punto entre dos ciudades fuera de ambos radios queda sin asignar', () => {
    // Medio camino Cáceres–Mérida: ~35 km de cada una, con radio 25.
    expect(asignarCiudad(39.196, -6.358)).toBeNull();
  });
});
