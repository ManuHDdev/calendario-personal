import { describe, it, expect } from 'vitest';
import {
  SQL_UPSERT_ANUNCIO,
  valoresUpsertAnuncio,
  construirListAnuncios,
} from './queries';
import type { AnuncioCrudo, ViabilidadColumnas } from '../types/locales';

const CRUDO: AnuncioCrudo = {
  tipo: 'local',
  portal: 'fotocasa',
  portalId: '123',
  url: 'https://fotocasa.es/123',
  titulo: 'Local',
  descripcion: 'desc',
  precio: 120000,
  precioAnterior: null,
  superficieM2: 90,
  facturacion: null,
  direccion: null,
  municipio: 'Badajoz',
  provincia: 'Badajoz',
  comunidad: null,
  latitud: 38.8,
  longitud: -6.9,
  precision: 'aproximada',
  imagenUrl: null,
};

const VIAB: ViabilidadColumnas = {
  veredicto: 'verde',
  veredicto_motivo: 'ok',
  distancia_farmacia_m: 300,
  farmacia_mas_cercana_id: 9,
  distancia_centro_m: null,
  centro_mas_cercano_id: null,
  viabilidad_calculada_en: new Date('2026-09-08T00:00:00Z'),
  viabilidad_motor: 'ors',
};

describe('SQL_UPSERT_ANUNCIO', () => {
  it('usa la clave por búsqueda y no resucita visto/descartado/notificado', () => {
    expect(SQL_UPSERT_ANUNCIO).toContain('ON CONFLICT (busqueda_id, portal, portal_id) DO UPDATE');
    expect(SQL_UPSERT_ANUNCIO).not.toMatch(/SET[\s\S]*\bvisto = /);
    expect(SQL_UPSERT_ANUNCIO).not.toMatch(/SET[\s\S]*\bdescartado = /);
    expect(SQL_UPSERT_ANUNCIO).not.toMatch(/SET[\s\S]*\bnotificado = /);
  });

  it('conserva el dato que ya había si el portal deja de informarlo', () => {
    expect(SQL_UPSERT_ANUNCIO).toContain('COALESCE(EXCLUDED.superficie_m2, anuncio.superficie_m2)');
    expect(SQL_UPSERT_ANUNCIO).toContain('COALESCE(EXCLUDED.municipio, anuncio.municipio)');
  });

  it('guarda precio_anterior solo cuando el precio cambia y devuelve es_nuevo', () => {
    expect(SQL_UPSERT_ANUNCIO).toContain('EXCLUDED.precio IS DISTINCT FROM anuncio.precio');
    expect(SQL_UPSERT_ANUNCIO).toContain('(xmax = 0) AS es_nuevo');
  });

  it('los valores van en el orden de los marcadores ($1 = busqueda_id)', () => {
    const v = valoresUpsertAnuncio(7, CRUDO, VIAB);
    expect(v[0]).toBe(7);
    expect(v[2]).toBe('fotocasa');
    expect(v[3]).toBe('123');
    expect(v).toHaveLength(26);
    expect(v[18]).toBe('verde');
  });
});

describe('construirListAnuncios', () => {
  it('filtra siempre por activo y excluye descartados por defecto', () => {
    const { text } = construirListAnuncios({});
    expect(text).toContain('a.activo = true');
    expect(text).toContain('b.activo = true');
    expect(text).toContain('a.descartado = false');
  });

  it('parametriza búsqueda, tipo y veredicto', () => {
    const { text, values } = construirListAnuncios({ busquedaId: 3, tipo: 'farmacia', veredicto: 'verde' });
    expect(text).toContain('a.busqueda_id = $1');
    expect(text).toContain('a.tipo = $2');
    expect(text).toContain('a.veredicto = $3');
    expect(values.slice(0, 3)).toEqual([3, 'farmacia', 'verde']);
  });

  it('acota el límite', () => {
    expect(construirListAnuncios({ limite: 99999 }).values.at(-1)).toBe(500);
    expect(construirListAnuncios({ limite: 0 }).values.at(-1)).toBe(1);
  });

  it('incluye descartados solo si se pide', () => {
    expect(construirListAnuncios({ incluirDescartados: true }).text).not.toContain('a.descartado = false');
  });
});
