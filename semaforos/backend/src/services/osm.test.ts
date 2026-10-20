import { describe, it, expect } from 'vitest';
import {
  NOMBRE_CIUDAD_RE,
  cardinal,
  construirConsultaOverpass,
  derivarCruces,
  difAngular,
  rumbo,
  type OsmElement,
} from './osm';

// ~0.001 grados de latitud son ~111 m; de longitud, ~85 m a 39 N.
const C = { lat: 39.47, lon: -6.37 };
const N = { lat: C.lat + 0.001, lon: C.lon };
const S = { lat: C.lat - 0.001, lon: C.lon };
const E = { lat: C.lat, lon: C.lon + 0.001 };
const O = { lat: C.lat, lon: C.lon - 0.001 };

describe('geometria', () => {
  it('rumbo a los puntos cardinales', () => {
    expect(rumbo(C, N)).toBeCloseTo(0, 0);
    expect(rumbo(C, E)).toBeCloseTo(90, 0);
    expect(rumbo(C, S)).toBeCloseTo(180, 0);
    expect(rumbo(C, O)).toBeCloseTo(270, 0);
  });

  it('cardinal en espanol, con el cierre en 360', () => {
    expect(cardinal(0)).toBe('N');
    expect(cardinal(44)).toBe('NE');
    expect(cardinal(225)).toBe('SO');
    expect(cardinal(359)).toBe('N');
  });

  it('difAngular toma el camino corto alrededor de 0/360', () => {
    expect(difAngular(350, 10)).toBe(20);
    expect(difAngular(0, 180)).toBe(180);
  });
});

function cruceEnCruz(): OsmElement[] {
  return [
    { type: 'node', id: 1, lat: C.lat, lon: C.lon, tags: { highway: 'traffic_signals' } },
    // Calle norte-sur partida en el cruce (dos ways que terminan/empiezan en el nodo 1)
    { type: 'way', id: 10, nodes: [100, 1], geometry: [N, C], tags: { highway: 'primary', name: 'Avenida de Alemania' } },
    { type: 'way', id: 11, nodes: [1, 101], geometry: [C, S], tags: { highway: 'primary', name: 'Avenida de Alemania' } },
    // Calle este-oeste que PASA por el nodo (un solo way)
    { type: 'way', id: 20, nodes: [102, 1, 103], geometry: [O, C, E], tags: { highway: 'residential', name: 'Calle Pintores' } },
  ];
}

describe('derivarCruces', () => {
  it('una cruz de dos calles de doble sentido da cuatro accesos', () => {
    const [cruce] = derivarCruces(cruceEnCruz());
    expect(cruce.accesos).toHaveLength(4);
    const rumbos = cruce.accesos.map((a) => a.rumbo_grados).sort((a, b) => a - b);
    // Se llega desde el norte circulando al sur (180), desde el sur al norte (0), etc.
    expect(rumbos).toEqual([0, 90, 180, 270]);
  });

  it('nombra el cruce con sus calles y el acceso con calle y sentido', () => {
    const [cruce] = derivarCruces(cruceEnCruz());
    expect(cruce.nombre).toBe('Avenida de Alemania / Calle Pintores');
    expect(cruce.accesos.map((a) => a.nombre)).toContain('Avenida de Alemania · hacia el S');
    expect(cruce.accesos.map((a) => a.nombre)).toContain('Calle Pintores · hacia el E');
  });

  it('una calle de sentido unico solo aporta la llegada en el sentido de la calle', () => {
    const els: OsmElement[] = [
      { type: 'node', id: 1, lat: C.lat, lon: C.lon },
      { type: 'way', id: 10, nodes: [100, 1], geometry: [N, C], tags: { highway: 'primary', oneway: 'yes' } },
    ];
    const [cruce] = derivarCruces(els);
    expect(cruce.accesos).toHaveLength(1);
    expect(cruce.accesos[0].rumbo_grados).toBe(180);
  });

  it('oneway=-1 invierte el sentido: solo se llega desde el nodo siguiente', () => {
    const els: OsmElement[] = [
      { type: 'node', id: 1, lat: C.lat, lon: C.lon },
      { type: 'way', id: 10, nodes: [100, 1, 101], geometry: [N, C, S], tags: { highway: 'primary', oneway: '-1' } },
    ];
    const [cruce] = derivarCruces(els);
    expect(cruce.accesos).toHaveLength(1);
    expect(cruce.accesos[0].rumbo_grados).toBe(0); // llega desde el sur circulando al norte
  });

  it('una rotonda es de sentido unico aunque no lleve oneway', () => {
    const els: OsmElement[] = [
      { type: 'node', id: 1, lat: C.lat, lon: C.lon },
      { type: 'way', id: 10, nodes: [100, 1, 101], geometry: [N, C, S], tags: { highway: 'secondary', junction: 'roundabout' } },
    ];
    const [cruce] = derivarCruces(els);
    expect(cruce.accesos).toHaveLength(1);
  });

  it('une llegadas de rumbo casi igual en un unico acceso', () => {
    const casiN = { lat: C.lat + 0.001, lon: C.lon + 0.00005 }; // ~3 grados de diferencia
    const els: OsmElement[] = [
      { type: 'node', id: 1, lat: C.lat, lon: C.lon },
      { type: 'way', id: 10, nodes: [100, 1], geometry: [N, C], tags: { highway: 'primary', name: 'A' } },
      { type: 'way', id: 11, nodes: [101, 1], geometry: [casiN, C], tags: { highway: 'primary' } },
    ];
    const [cruce] = derivarCruces(els);
    const delNorte = cruce.accesos.filter((a) => a.rumbo_grados > 150 && a.rumbo_grados < 210);
    expect(delNorte).toHaveLength(1);
  });

  it('un nodo sin calles de coches no revienta: queda sin accesos', () => {
    const [cruce] = derivarCruces([{ type: 'node', id: 7, lat: C.lat, lon: C.lon }]);
    expect(cruce.accesos).toEqual([]);
    expect(cruce.nombre).toBe('Cruce sin nombre');
  });

  it('ignora calles que no pasan por el nodo', () => {
    const els: OsmElement[] = [
      { type: 'node', id: 1, lat: C.lat, lon: C.lon },
      { type: 'way', id: 99, nodes: [500, 501], geometry: [N, S], tags: { highway: 'primary' } },
    ];
    expect(derivarCruces(els)[0].accesos).toEqual([]);
  });

  it('tolera geometria incompleta (null) en los extremos', () => {
    const els: OsmElement[] = [
      { type: 'node', id: 1, lat: C.lat, lon: C.lon },
      { type: 'way', id: 10, nodes: [100, 1, 101], geometry: [null, C, S], tags: { highway: 'primary' } },
    ];
    expect(derivarCruces(els)[0].accesos).toHaveLength(1);
  });
});

describe('consulta Overpass', () => {
  it('acepta nombres de municipio con tilde, guion y espacios', () => {
    for (const n of ['Cáceres', 'Santa Cruz de Tenerife', 'Vitoria-Gasteiz', "L'Hospitalet de Llobregat"]) {
      expect(NOMBRE_CIUDAD_RE.test(n)).toBe(true);
    }
  });

  it('rechaza lo que podria cerrar la cadena e inyectar Overpass QL', () => {
    for (const n of ['Cáceres"];out;', 'a"b', 'x\\y', 'a;b', '', 'a']) {
      expect(NOMBRE_CIUDAD_RE.test(n)).toBe(false);
      expect(() => construirConsultaOverpass(n)).toThrow();
    }
  });

  it('limita al municipio (admin_level 8), no a la provincia', () => {
    const q = construirConsultaOverpass('Cáceres');
    expect(q).toContain('"admin_level"="8"');
    expect(q).toContain('"name"="Cáceres"');
    expect(q).toContain('highway"="traffic_signals');
  });
});
