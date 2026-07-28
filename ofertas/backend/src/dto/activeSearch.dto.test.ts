import { describe, it, expect } from 'vitest';
import { toActiveSearchDto } from './activeSearch.dto';
import type { Busqueda } from '../types/busqueda';

const row: Busqueda = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Juegos DS baratos',
  keyword: 'juegos ds',
  precio_min: null,
  precio_max: 15,
  latitude: 39.4753,
  longitude: -6.3724,
  distance_km: 30,
  milanuncios_province_slug: null,
  language_filter: null,
  console_only: false,
  sitios: {
    wallapop: { enabled: true },
    milanuncios: { enabled: false },
    vinted: { enabled: false },
  },
  activo: true,
  deleted_at: null,
  created_at: '2026-07-27T00:00:00.000Z',
  updated_at: '2026-07-27T00:00:00.000Z',
};

describe('toActiveSearchDto', () => {
  it('maps busqueda field names to the marketplace-watcher SearchQuery shape', () => {
    expect(toActiveSearchDto(row)).toEqual({
      name: 'Juegos DS baratos',
      keyword: 'juegos ds',
      max_price: 15,
      min_price: null,
      latitude: 39.4753,
      longitude: -6.3724,
      distance_km: 30,
      milanuncios_province_slug: null,
      language_filter: null,
      console_only: false,
      sites: {
        wallapop: { enabled: true },
        milanuncios: { enabled: false },
        vinted: { enabled: false },
      },
    });
  });

  it('maps a non-null language_filter through to the DTO', () => {
    const dto = toActiveSearchDto({ ...row, language_filter: 'es' });
    expect(dto.language_filter).toBe('es');
  });

  it('maps console_only=true through to the DTO', () => {
    const dto = toActiveSearchDto({ ...row, console_only: true });
    expect(dto.console_only).toBe(true);
  });

  it('never leaks internal DB-only columns (id, activo, deleted_at, timestamps)', () => {
    const dto = toActiveSearchDto(row) as Record<string, unknown>;
    expect(dto).not.toHaveProperty('id');
    expect(dto).not.toHaveProperty('activo');
    expect(dto).not.toHaveProperty('deleted_at');
    expect(dto).not.toHaveProperty('created_at');
    expect(dto).not.toHaveProperty('updated_at');
  });
});
