import { describe, it, expect } from 'vitest';
import { aDto, construirListadoQuery, construirUpsertCamaraDgtQuery } from './queries';
import type { CamaraRow } from '../types/camara';

const fila: CamaraRow = {
  id: 1, origen: 'dgt', external_id: 'X', nombre: 'A-5', carretera: 'A-5', ciudad: 'merida',
  latitud: 38.9, longitud: -6.3, distancia_km: 3.456, url_imagen: 'https://origen.test/a.jpg',
  url_pagina: null, fuente: null, favorita: false, visto_en: new Date('2026-10-20T10:00:00Z'),
};

describe('aDto', () => {
  it('no filtra la URL de origen ni deleted_at; indica solo si hay imagen', () => {
    const dto = aDto(fila) as unknown as Record<string, unknown>;
    expect(dto.tieneImagen).toBe(true);
    expect(dto).not.toHaveProperty('url_imagen');
    expect(dto).not.toHaveProperty('urlImagen');
    expect(dto).not.toHaveProperty('deleted_at');
    expect(dto).not.toHaveProperty('deletedAt');
  });

  it('redondea la distancia a 1 decimal y etiqueta la fuente', () => {
    expect(aDto(fila).distanciaKm).toBe(3.5);
    expect(aDto(fila).fuente).toBe('DGT');
    expect(aDto({ ...fila, origen: 'manual', fuente: null, url_imagen: null }).fuente).toBe('Manual');
    expect(aDto({ ...fila, origen: 'manual', fuente: 'Turismo', url_imagen: null }).tieneImagen).toBe(false);
  });
});

describe('construirListadoQuery', () => {
  it('siempre filtra por activo y no retiradas, incluso sin filtros', () => {
    const { text, values } = construirListadoQuery({});
    expect(text).toContain('activo = true');
    expect(text).toContain('retirada = false');
    expect(values).toEqual([]);
  });

  it('parametriza los filtros (sin interpolar valores en el SQL)', () => {
    const { text, values } = construirListadoQuery({ ciudad: "bada'joz", favorita: 'true' });
    expect(values).toEqual(["bada'joz", true]);
    expect(text).not.toContain("bada'joz");
  });
});

describe('construirUpsertCamaraDgtQuery', () => {
  const camara = { externalId: 'X', nombre: 'n', carretera: null, latitud: 1, longitud: 2, urlImagen: 'https://a.test/a.jpg' };

  it('no actualiza favorita ni activo en conflicto', () => {
    const { text } = construirUpsertCamaraDgtQuery(camara, 'caceres', 2);
    const tras = text.split('DO UPDATE SET')[1];
    expect(tras).not.toMatch(/favorita|activo/);
    expect(tras).toContain('retirada = false');
  });

  it('es determinista: misma entrada, misma query (idempotencia en la unique)', () => {
    expect(construirUpsertCamaraDgtQuery(camara, 'caceres', 2)).toEqual(construirUpsertCamaraDgtQuery(camara, 'caceres', 2));
  });

  it('rechaza una ciudad que no existe', () => {
    expect(() => construirUpsertCamaraDgtQuery(camara, 'narnia', 1)).toThrow(/Ciudad desconocida/);
  });
});
