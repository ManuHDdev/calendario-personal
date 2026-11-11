import { HttpError } from '../errors';
import type { Estado, Product } from './types';

/**
 * Allowed state transitions (same-state is always a no-op and allowed).
 *
 *   pendiente --> listo --> resena_generada --> publicado
 *
 * - `listo` is set only by a user/Claude through an explicit action (listo
 *   endpoint or PUT estado), never as a side effect of autosaving.
 * - `resena_generada` is set by the review endpoint.
 * - `publicado` is set by the publicado endpoint; it can be reopened to
 *   `resena_generada` if it was marked by mistake.
 */
const ALLOWED: Record<Estado, readonly Estado[]> = {
  pendiente: ['listo', 'resena_generada', 'publicado'],
  listo: ['pendiente', 'resena_generada', 'publicado'],
  resena_generada: ['pendiente', 'listo', 'publicado'],
  publicado: ['resena_generada'],
};

export function canTransition(from: Estado, to: Estado): boolean {
  return from === to || ALLOWED[from].includes(to);
}

/** A product is ready for Claude to write the review once it has feedback and stars. */
export function isReadyForReview(p: Pick<Product, 'feedback' | 'estrellas'>): boolean {
  return p.feedback.trim() !== '' && p.estrellas !== null;
}

/** Throws 409 when moving `product` to `to` is not allowed. */
export function assertTransition(
  product: Pick<Product, 'estado' | 'feedback' | 'estrellas'>,
  to: Estado,
): void {
  if (!canTransition(product.estado, to)) {
    throw new HttpError(409, 'InvalidTransition', `Cannot move from ${product.estado} to ${to}`);
  }
  if (to === 'listo' && product.estado !== 'listo' && !isReadyForReview(product)) {
    throw new HttpError(409, 'ProductIncomplete', 'Feedback and stars are required before marking as listo');
  }
}

/** The review endpoint never touches an already published product. */
export function assertCanStoreReview(product: Pick<Product, 'estado'>): void {
  if (product.estado === 'publicado') {
    throw new HttpError(409, 'InvalidTransition', 'Product is already publicado');
  }
}
