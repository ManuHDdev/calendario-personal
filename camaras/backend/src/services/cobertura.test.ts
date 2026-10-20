import { describe, it, expect } from 'vitest';
import { filtrarCercanas, contarPorCiudad, resumirCobertura } from './cobertura';
import type { CamaraDgt } from './dgtParser';

const cam = (id: string, latitud: number, longitud: number, extra: Partial<CamaraDgt> = {}): CamaraDgt => ({
  externalId: id, nombre: `Nombre ${id}`, carretera: 'A-5', latitud, longitud, urlImagen: `https://x.test/${id}.jpg`, ...extra,
});

const feed = [
  cam('mer', 38.9161, -6.3437),
  cam('bad', 38.88, -6.95),
  cam('mad', 40.4168, -3.7038),
  cam('cac', 39.48, -6.37, { carretera: null, nombre: 'Cámara 7' }),
];

describe('filtrarCercanas', () => {
  it('descarta las que no caen en ninguna ciudad y asigna la ciudad', () => {
    const r = filtrarCercanas(feed);
    expect(r.map((c) => [c.camara.externalId, c.ciudad])).toEqual([['mer', 'merida'], ['bad', 'badajoz'], ['cac', 'caceres']]);
  });
});

describe('contarPorCiudad / resumirCobertura', () => {
  it('incluye todas las ciudades, también las que tienen 0', () => {
    expect(contarPorCiudad(filtrarCercanas(feed))).toEqual({
      caceres: 1, badajoz: 1, merida: 1, 'villanueva-de-la-serena': 0,
    });
  });

  it('resume totales y cobertura de campos', () => {
    const r = resumirCobertura(feed);
    expect(r.totalFeed).toBe(4);
    expect(r.totalCercanas).toBe(3);
    expect(r.conCarretera).toBe(2);
    expect(r.sinNombreReal).toBe(1);
  });

  it('feed vacío: todo a cero', () => {
    const r = resumirCobertura([]);
    expect(r.totalCercanas).toBe(0);
    expect(Object.values(r.porCiudad).every((n) => n === 0)).toBe(true);
  });
});
