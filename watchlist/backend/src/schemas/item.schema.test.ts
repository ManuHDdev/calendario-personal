import { describe, it, expect } from 'vitest';
import { createItemSchema, updateItemSchema } from './item.schema';

describe('createItemSchema', () => {
  it('accepts a minimal valid payload', () => {
    const result = createItemSchema.safeParse({ tipo: 'pelicula', titulo: 'Interstellar' });
    expect(result.success).toBe(true);
  });

  it('accepts a full valid payload', () => {
    const result = createItemSchema.safeParse({
      tipo: 'libro',
      external_id: 'abc123',
      fuente: 'google_books',
      titulo: 'Dune',
      autor: 'Frank Herbert',
      poster_url: 'https://example.com/dune.jpg',
      sinopsis: 'Una novela de ciencia ficción.',
      estado: 'en_curso',
      nota: 'Muy buena',
      rating: 5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a payload missing titulo', () => {
    const result = createItemSchema.safeParse({ tipo: 'serie' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid tipo', () => {
    const result = createItemSchema.safeParse({ tipo: 'documental', titulo: 'Algo' });
    expect(result.success).toBe(false);
  });

  it('rejects rating out of range', () => {
    const result = createItemSchema.safeParse({ tipo: 'pelicula', titulo: 'Algo', rating: 6 });
    expect(result.success).toBe(false);
  });

  it('rejects rating below 1', () => {
    const result = createItemSchema.safeParse({ tipo: 'pelicula', titulo: 'Algo', rating: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects an empty titulo', () => {
    const result = createItemSchema.safeParse({ tipo: 'pelicula', titulo: '' });
    expect(result.success).toBe(false);
  });
});

describe('updateItemSchema', () => {
  it('accepts a partial valid payload', () => {
    const result = updateItemSchema.safeParse({ estado: 'completado', rating: 4 });
    expect(result.success).toBe(true);
  });

  it('accepts nullable fields set to null', () => {
    const result = updateItemSchema.safeParse({ autor: null, nota: null });
    expect(result.success).toBe(true);
  });

  it('rejects unknown fields (strict)', () => {
    const result = updateItemSchema.safeParse({ estado: 'completado', extra: 'nope' });
    expect(result.success).toBe(false);
  });

  it('rejects tipo, which is immutable', () => {
    const result = updateItemSchema.safeParse({ tipo: 'serie' });
    expect(result.success).toBe(false);
  });
});
