import { describe, it, expect } from 'vitest';
import { agruparDuplicados, confianzaFuente, RADIO_DUPLICADO_M } from './fusion';
import type { RegistroPadron } from './fusion';

const BASE = { lat: 40.4169, lng: -3.7035 };

/** Desplaza un punto `metros` hacia el norte. */
function alNorte(metros: number) {
  return { lat: BASE.lat + metros / 111_320, lng: BASE.lng };
}

function reg(id: number, fuente: string, pos: { lat: number; lng: number }): RegistroPadron {
  return { id, fuente, nombre: `Farmacia ${id}`, ...pos };
}

describe('confianzaFuente', () => {
  it('el dato oficial manda sobre OSM', () => {
    expect(confianzaFuente('oficial_madrid')).toBeGreaterThan(confianzaFuente('osm'));
  });

  it('una fuente desconocida es la menos fiable', () => {
    expect(confianzaFuente('vete a saber')).toBeLessThan(confianzaFuente('osm'));
  });
});

describe('agruparDuplicados', () => {
  it('no fusiona nada por debajo del radio si están solos', () => {
    const r = agruparDuplicados([reg(1, 'osm', BASE)]);
    expect(r).toEqual([]);
  });

  it('fusiona dos registros a pocos metros y conserva el oficial', () => {
    const registros = [reg(1, 'osm', BASE), reg(2, 'oficial_madrid', alNorte(15))];
    const r = agruparDuplicados(registros);
    expect(r).toHaveLength(1);
    expect(r[0].supervivienteId).toBe(2);
    expect(r[0].duplicadosIds).toEqual([1]);
  });

  it('NO fusiona farmacias separadas por la distancia legal', () => {
    // 250 m es exactamente la separación mínima entre farmacias: fusionarlas
    // borraría del padrón una farmacia real y crearía un falso verde.
    const registros = [reg(1, 'osm', BASE), reg(2, 'osm', alNorte(250))];
    expect(agruparDuplicados(registros)).toEqual([]);
  });

  it('no fusiona justo por encima del radio', () => {
    const registros = [reg(1, 'osm', BASE), reg(2, 'osm', alNorte(RADIO_DUPLICADO_M + 10))];
    expect(agruparDuplicados(registros)).toEqual([]);
  });

  it('fusiona justo por debajo del radio', () => {
    const registros = [reg(1, 'osm', BASE), reg(2, 'osm', alNorte(RADIO_DUPLICADO_M - 10))];
    expect(agruparDuplicados(registros)).toHaveLength(1);
  });

  it('a igualdad de fuente conserva el id menor, para ser estable entre pasadas', () => {
    const registros = [reg(7, 'osm', BASE), reg(3, 'osm', alNorte(10))];
    const r = agruparDuplicados(registros);
    expect(r[0].supervivienteId).toBe(3);
  });

  it('agrupa transitivamente una cadena de solapes', () => {
    const registros = [
      reg(1, 'osm', BASE),
      reg(2, 'osm', alNorte(25)),
      reg(3, 'oficial_madrid', alNorte(50)),
    ];
    const r = agruparDuplicados(registros);
    expect(r).toHaveLength(1);
    expect(r[0].supervivienteId).toBe(3);
    expect(r[0].duplicadosIds.sort()).toEqual([1, 2]);
  });

  it('mantiene grupos independientes separados', () => {
    const registros = [
      reg(1, 'osm', BASE),
      reg(2, 'oficial_madrid', alNorte(10)),
      reg(3, 'osm', alNorte(500)),
      reg(4, 'oficial_madrid', alNorte(510)),
    ];
    const r = agruparDuplicados(registros);
    expect(r).toHaveLength(2);
    expect(r.map((d) => d.supervivienteId).sort()).toEqual([2, 4]);
  });
});
