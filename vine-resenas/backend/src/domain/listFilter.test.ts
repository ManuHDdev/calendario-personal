import { describe, it, expect } from 'vitest';
import { filterProducts } from './listFilter';
import type { ProductWithMedia } from './types';

function p(over: Partial<ProductWithMedia> & { asin: string }): ProductWithMedia {
  return {
    titulo: '',
    descripcion: '',
    feedback: '',
    estrellas: null,
    estado: 'pendiente',
    resena_producto: '',
    resena_resumida: '',
    resena_extendida: '',
    created_at: '',
    updated_at: '',
    media: [],
    ...over,
  };
}
const photo = { id: 1, asin: 'X', filename: 'a.jpg', type: 'photo' as const, size: 1, created_at: '' };

const data = [
  p({ asin: 'AAAAAAAAAA', titulo: 'Cable USB', media: [photo], feedback: 'ok', estrellas: 5 }),
  p({ asin: 'BBBBBBBBBB', titulo: 'Taza' }),
  p({ asin: 'CCCCCCCCCC', titulo: 'Lampara', estado: 'listo', media: [photo], feedback: 'x', estrellas: 3 }),
  p({ asin: 'DDDDDDDDDD', titulo: 'Reloj', estado: 'resena_generada', media: [photo], feedback: 'x', estrellas: 3 }),
  p({ asin: 'EEEEEEEEEE', titulo: 'Viejo', estado: 'publicado' }),
];
const asins = (r: ProductWithMedia[]) => r.map((x) => x.asin[0]);

describe('filterProducts', () => {
  it('excludes publicado by default', () => {
    expect(asins(filterProducts(data, {}))).toEqual(['A', 'B', 'C', 'D']);
  });
  it('returns only publicado when asked', () => {
    expect(asins(filterProducts(data, { estado: 'publicado' }))).toEqual(['E']);
  });
  it('searches title and ASIN case-insensitively', () => {
    expect(asins(filterProducts(data, { q: 'usb' }))).toEqual(['A']);
    expect(asins(filterProducts(data, { q: 'bbbb' }))).toEqual(['B']);
  });
  it('filters missing photos / missing feedback / listos / resena_generada', () => {
    expect(asins(filterProducts(data, { filter: 'faltan_fotos' }))).toEqual(['B']);
    expect(asins(filterProducts(data, { filter: 'falta_feedback' }))).toEqual(['B']);
    expect(asins(filterProducts(data, { filter: 'listos' }))).toEqual(['C']);
    expect(asins(filterProducts(data, { filter: 'resena_generada' }))).toEqual(['D']);
  });
});
