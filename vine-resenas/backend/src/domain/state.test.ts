import { describe, it, expect } from 'vitest';
import { HttpError } from '../errors';
import { assertCanStoreReview, assertTransition, canTransition, isReadyForReview } from './state';

const ready = { feedback: 'good', estrellas: 4 };
const empty = { feedback: '', estrellas: null };

describe('state machine', () => {
  it('allows the forward path', () => {
    expect(canTransition('pendiente', 'listo')).toBe(true);
    expect(canTransition('listo', 'resena_generada')).toBe(true);
    expect(canTransition('resena_generada', 'publicado')).toBe(true);
  });
  it('treats same-state as allowed', () => {
    expect(canTransition('publicado', 'publicado')).toBe(true);
  });
  it('only allows reopening a published product to resena_generada', () => {
    expect(canTransition('publicado', 'resena_generada')).toBe(true);
    expect(canTransition('publicado', 'pendiente')).toBe(false);
    expect(canTransition('publicado', 'listo')).toBe(false);
  });
  it('requires feedback and stars to mark listo', () => {
    expect(isReadyForReview(ready)).toBe(true);
    expect(isReadyForReview({ feedback: '   ', estrellas: 4 })).toBe(false);
    expect(isReadyForReview({ feedback: 'x', estrellas: null })).toBe(false);
    expect(() => assertTransition({ estado: 'pendiente', ...empty }, 'listo')).toThrow(/required/);
    expect(() => assertTransition({ estado: 'pendiente', ...ready }, 'listo')).not.toThrow();
  });
  it('is idempotent for listo even if content was later emptied', () => {
    expect(() => assertTransition({ estado: 'listo', ...empty }, 'listo')).not.toThrow();
  });
  it('rejects an invalid transition with 409', () => {
    expect.assertions(2);
    try {
      assertTransition({ estado: 'publicado', ...ready }, 'pendiente');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).statusCode).toBe(409);
    }
  });
  it('refuses to store a review on a published product only', () => {
    expect(() => assertCanStoreReview({ estado: 'publicado' })).toThrow(HttpError);
    expect(() => assertCanStoreReview({ estado: 'pendiente' })).not.toThrow();
    expect(() => assertCanStoreReview({ estado: 'resena_generada' })).not.toThrow();
  });
});
