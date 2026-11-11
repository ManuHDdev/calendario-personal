import { HttpError } from '../errors';
import type { ProductRepository } from '../db/repository';
import { assertCanStoreReview, assertTransition } from '../domain/state';
import type { Estado, Product, ProductPatch, ProductWithMedia } from '../domain/types';

export async function requireProduct(repo: ProductRepository, asin: string): Promise<ProductWithMedia> {
  const p = await repo.get(asin);
  if (!p) throw new HttpError(404, 'NotFound', `Product ${asin} not found`);
  return p;
}

/** Autosave path: edits content fields only, never the state. */
export async function editProduct(repo: ProductRepository, asin: string, patch: ProductPatch): Promise<Product> {
  await requireProduct(repo, asin);
  const updated = await repo.update(asin, patch);
  if (!updated) throw new HttpError(404, 'NotFound', `Product ${asin} not found`);
  return updated;
}

export async function changeEstado(repo: ProductRepository, asin: string, to: Estado): Promise<Product> {
  const current = await requireProduct(repo, asin);
  assertTransition(current, to);
  if (current.estado === to) return current;
  const updated = await repo.setEstado(asin, to);
  if (!updated) throw new HttpError(404, 'NotFound', `Product ${asin} not found`);
  return updated;
}

export async function storeResena(
  repo: ProductRepository,
  asin: string,
  r: { resena_producto: string; resena_resumida: string; resena_extendida: string },
): Promise<Product> {
  const current = await requireProduct(repo, asin);
  assertCanStoreReview(current);
  const updated = await repo.setResena(asin, r);
  if (!updated) throw new HttpError(404, 'NotFound', `Product ${asin} not found`);
  return updated;
}
