import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError } from '../errors';
import type { GuestLink, MediaRow, ProductWithMedia } from '../domain/types';
import { parseStoredFilename } from '../domain/validation';
import { MAX_GUEST_FILES, resolveGuestLink } from '../services/guestLinkService';
import { removeMedia } from '../services/mediaService';
import { RateLimiter } from '../services/rateLimiter';
import type { AppDeps } from './deps';
import { GUEST_BASE } from './presenters';
import { guestFeedbackSchema } from './schemas';
import { serveMedia } from './serveMedia';
import { processUploads } from './uploadParts';

export interface GuestRateLimits {
  /** Requests per IP per window, any /guest route. */
  max: number;
  windowMs: number;
  /** Invalid-token lookups per IP per window before the IP is blocked outright. */
  maxFailures: number;
  failureWindowMs: number;
}

export const DEFAULT_GUEST_LIMITS: GuestRateLimits = {
  max: 120,
  windowMs: 60_000,
  maxFailures: 20,
  failureWindowMs: 10 * 60_000,
};

/** The only owner media a guest may see: the product's cover photo (the owner's first photo). */
function coverPhoto(product: ProductWithMedia): MediaRow | undefined {
  return product.media.find((m) => m.type === 'photo' && m.uploaded_via_guest_link_id == null);
}

function presentGuestMedia(token: string, m: Pick<MediaRow, 'filename' | 'type' | 'size'>) {
  return {
    filename: m.filename,
    type: m.type,
    size: m.size,
    url: `${GUEST_BASE}/${token}/media/${m.filename}`,
  };
}

/**
 * Public, no-auth routes for a relative holding a guest link. Mounted under /vine-resenas/api/guest, so the
 * existing nginx /vine-resenas/ and /vine-resenas/api/ locations (both access_log off) already cover it.
 * The secret is the token in the path: 256 random bits, only its SHA-256 is stored. Every failure to resolve
 * it (unknown, malformed, expired, revoked) is the same 404. Nothing but the product title, a cover photo,
 * the guest's own text and the guest's own uploads is exposed: no stars, state, reviews or owner media.
 */
export function guestRoutes(deps: AppDeps, limits: GuestRateLimits = DEFAULT_GUEST_LIMITS) {
  const { repo } = deps;
  const perIp = new RateLimiter(limits.max, limits.windowMs);
  const failures = new RateLimiter(limits.maxFailures, limits.failureWindowMs);

  async function resolve(
    request: FastifyRequest,
  ): Promise<{ token: string; link: GuestLink; product: ProductWithMedia }> {
    const token = (request.params as { token: string }).token;
    if (failures.blocked(request.ip).blocked) throw new HttpError(429, 'TooManyRequests', 'Too many requests');
    try {
      const { link, product } = await resolveGuestLink(repo, token);
      return { token, link, product };
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 404) failures.hit(request.ip);
      throw err;
    }
  }

  return async function (app: FastifyInstance): Promise<void> {
    app.addHook('onRequest', async (request, reply) => {
      const r = perIp.hit(request.ip);
      if (!r.allowed) {
        reply.header('Retry-After', String(r.retryAfterSec));
        throw new HttpError(429, 'TooManyRequests', 'Too many requests');
      }
      // The token must never be cached or leaked through the Referer header.
      reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer');
    });

    app.get('/:token', async (request) => {
      const { token, link, product } = await resolve(request);
      await repo.touchGuestLink(link.id);
      const cover = coverPhoto(product);
      const own = product.media.filter((m) => m.uploaded_via_guest_link_id === link.id);
      return {
        titulo: product.titulo || product.asin,
        thumbnail_url: cover ? presentGuestMedia(token, cover).url : null,
        feedback: product.guest_feedback,
        media: own.map((m) => presentGuestMedia(token, m)),
        limits: { maxFiles: MAX_GUEST_FILES, used: own.length },
        expiresAt: link.expires_at,
      };
    });

    app.put('/:token/feedback', async (request) => {
      const { product } = await resolve(request);
      const { feedback } = guestFeedbackSchema.parse(request.body ?? {});
      await repo.setGuestFeedback(product.asin, feedback);
      return { feedback };
    });

    app.post('/:token/media', async (request, reply) => {
      const { token, link, product } = await resolve(request);
      if (!request.isMultipart()) throw new HttpError(400, 'BadRequest', 'Expected multipart/form-data');
      const used = await repo.countGuestMedia(link.id);
      const remaining = Math.max(0, MAX_GUEST_FILES - used);
      if (remaining === 0) throw new HttpError(409, 'UploadLimitReached', 'Upload limit reached for this link');

      const out = await processUploads(deps, request, product.asin, { guestLinkId: link.id, maxFiles: remaining });
      const uploaded = out.uploaded.map((m) => presentGuestMedia(token, m));
      if (uploaded.length === 0) {
        if (out.rejected.length === 0) throw new HttpError(400, 'BadRequest', 'No files received');
        reply.code(out.rejected[0].status);
      } else {
        reply.code(201);
      }
      return { uploaded, replaced: out.replaced, rejected: out.rejected };
    });

    // A guest may read only its own uploads and the cover photo.
    app.get('/:token/media/:filename', async (request, reply) => {
      const { link, product } = await resolve(request);
      const filename = parseStoredFilename((request.params as { filename: string }).filename);
      const m = product.media.find((x) => x.filename === filename);
      const allowed = m && (m.uploaded_via_guest_link_id === link.id || m.filename === coverPhoto(product)?.filename);
      if (!allowed) throw new HttpError(404, 'NotFound', 'Media not found');
      return serveMedia(deps, request, reply, product.asin, filename);
    });

    // A guest may delete only what its own link uploaded, never the owner's media.
    app.delete('/:token/media/:filename', async (request, reply) => {
      const { link, product } = await resolve(request);
      const filename = parseStoredFilename((request.params as { filename: string }).filename);
      const m = await repo.getMedia(product.asin, filename);
      if (!m || m.uploaded_via_guest_link_id !== link.id) throw new HttpError(404, 'NotFound', 'Media not found');
      await removeMedia(deps, product.asin, filename);
      return reply.code(204).send();
    });
  };
}
