import { describe, it, expect } from 'vitest';
import { HttpError } from '../errors';
import { assertCanStoreReview, assertEstadoViaPut, assertTransition, canTransition, isReadyForReview } from './state';

const ready = { feedback: 'good', estrellas: 4 };
const empty = { feedback: '', estrellas: null };

describe('state machine', () => {
  it('allows the forward path', () => {
    expect(canTransition('pendiente', 'listo')).toBe(true);
    expect(canTransition('resena_generada', 'publicado')).toBe(true);
  });
  it('reaches resena_generada and publicado only from the right states', () => {
    expect(canTransition('pendiente', 'resena_generada')).toBe(false);
    expect(canTransition('listo', 'resena_generada')).toBe(false);
    expect(canTransition('pendiente', 'publicado')).toBe(false);
    expect(canTransition('listo', 'publicado')).toBe(false);
    expect(() => assertTransition({ estado: 'listo', ...ready }, 'publicado')).toThrow(/only a product in resena_generada/);
  });
  it('limits PUT estado to pendiente/listo (plus reopening a published product)', () => {
    expect(() => assertEstadoViaPut('pendiente', 'listo')).not.toThrow();
    expect(() => assertEstadoViaPut('listo', 'pendiente')).not.toThrow();
    expect(() => assertEstadoViaPut('publicado', 'publicado')).not.toThrow();
    expect(() => assertEstadoViaPut('publicado', 'resena_generada')).not.toThrow();
    expect(() => assertEstadoViaPut('pendiente', 'resena_generada')).toThrow(HttpError);
    expect(() => assertEstadoViaPut('resena_generada', 'publicado')).toThrow(/POST \.\.\.\/publicado/);
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
