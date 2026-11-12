import { createHash, randomBytes } from 'crypto';
import { HttpError } from '../errors';
import type { ProductRepository } from '../db/repository';
import type { GuestLink, GuestLinkStatus, ProductWithMedia } from '../domain/types';

export const DEFAULT_EXPIRY_DAYS = 14;
export const MAX_EXPIRY_DAYS = 60;
/** Total files a single guest link may upload (photos + video). */
export const MAX_GUEST_FILES = 30;
export const MAX_GUEST_FEEDBACK_CHARS = 5000;

const DAY_MS = 24 * 60 * 60 * 1000;
// 32 random bytes -> 43 base64url chars. Anything else cannot be a token, so it is rejected before the DB.
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** 32 random bytes, base64url. Shown to the owner once; only its hash is stored. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function linkStatus(link: Pick<GuestLink, 'expires_at' | 'revoked_at'>, now: Date = new Date()): GuestLinkStatus {
  if (link.revoked_at) return 'revoked';
  if (new Date(link.expires_at).getTime() <= now.getTime()) return 'expired';
  return 'active';
}

export interface CreatedLink {
  link: GuestLink;
  token: string;
}

export async function createGuestLink(
  repo: ProductRepository,
  asin: string,
  opts: { expiresInDays: number; createdBy: string | null; now?: Date },
): Promise<CreatedLink> {
  const product = await repo.get(asin);
  if (!product) throw new HttpError(404, 'NotFound', `Product ${asin} not found`);
  if (product.estado === 'publicado') {
    throw new HttpError(409, 'InvalidTransition', 'Cannot create a guest link for a published product');
  }
  const token = generateToken();
  const expiresAt = new Date((opts.now ?? new Date()).getTime() + opts.expiresInDays * DAY_MS);
  const link = await repo.createGuestLink({ asin, tokenHash: hashToken(token), expiresAt, createdBy: opts.createdBy });
  return { link, token };
}

export interface ResolvedGuest {
  link: GuestLink;
  product: ProductWithMedia;
}

const invalid = () => new HttpError(404, 'NotFound', 'Link not found');

/**
 * Resolves a raw token to its link and product. Unknown, malformed, expired and revoked tokens all
 * yield the SAME 404 (no enumeration). A valid link whose product was already published gets 410.
 */
export async function resolveGuestLink(
  repo: ProductRepository,
  rawToken: unknown,
  now: Date = new Date(),
): Promise<ResolvedGuest> {
  if (typeof rawToken !== 'string' || !TOKEN_RE.test(rawToken)) throw invalid();
  const link = await repo.findGuestLinkByHash(hashToken(rawToken));
  if (!link || linkStatus(link, now) !== 'active') throw invalid();
  const product = await repo.get(link.asin);
  if (!product) throw invalid();
  if (product.estado === 'publicado') {
    throw new HttpError(410, 'LinkClosed', 'This product has already been published');
  }
  return { link, product };
}
