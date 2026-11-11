import { HttpError } from '../errors';
import type { Estado, Product } from './types';

/**
 * Allowed state transitions (same-state is always a no-op and allowed).
 *
 *   pendiente --> listo --> resena_generada --> publicado
 *
 * - `listo` is set only by a user/Claude through an explicit action (listo
 *   endpoint or PUT estado), never as a side effect of autosaving.
 * - `resena_generada` is reached ONLY through the review endpoint
 *   (`repo.setResena`), which does not go through this table.
 * - `publicado` is reached ONLY from `resena_generada` via the publicado
 *   endpoint; it can be reopened to `resena_generada` if marked by mistake.
 */
const ALLOWED: Record<Estado, readonly Estado[]> = {
  pendiente: ['listo'],
  listo: ['pendiente'],
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
    const hint =
      to === 'publicado'
        ? ' (only a product in resena_generada can be marked as publicado)'
        : to === 'resena_generada'
          ? ' (resena_generada is only reached by storing a review via PUT .../resena)'
          : '';
    throw new HttpError(409, 'InvalidTransition', `Cannot move from ${product.estado} to ${to}${hint}`);
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

/**
 * Extra rule for the free-form `estado` of `PUT /v1/products/:asin`: it may only
 * move among pendiente/listo. `resena_generada` and `publicado` have dedicated
 * endpoints; the one exception is reopening a published product back to
 * `resena_generada`, which has no other route.
 */
export function assertEstadoViaPut(from: Estado, to: Estado): void {
  if (from === to || to === 'pendiente' || to === 'listo') return;
  if (to === 'resena_generada' && from === 'publicado') return;
  const via = to === 'publicado' ? 'POST .../publicado' : 'PUT .../resena';
  throw new HttpError(409, 'InvalidTransition', `estado ${to} cannot be set via PUT; use ${via}`);
}
