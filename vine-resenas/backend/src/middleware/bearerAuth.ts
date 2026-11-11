import { createHash, timingSafeEqual } from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Static bearer token used ONLY by the Claude API (/vine-resenas/api/v1).
// Independent from the Keycloak JWT: a valid JWT does not pass here and this
// token gives no access to the UI routes. Modeled on ofertas/scraperAuth.ts.

/**
 * Pure check of `Authorization: Bearer <token>` against the expected key.
 * Both sides are hashed with SHA-256 first so timingSafeEqual always compares
 * equal-length buffers and token length is not leaked. An empty/unset expected
 * key rejects everything.
 */
export function isValidApiToken(authHeader: string | undefined, expectedKey: string | undefined): boolean {
  if (!expectedKey) return false;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  if (!token) return false;
  const a = createHash('sha256').update(token).digest();
  const b = createHash('sha256').update(expectedKey).digest();
  return timingSafeEqual(a, b);
}

/** Fastify hook. Never logs the token or the Authorization header. */
export function apiTokenMiddleware(getExpected: () => string | undefined = () => process.env.VINE_API_TOKEN) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!isValidApiToken(request.headers.authorization, getExpected())) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Missing or invalid API token' });
    }
  };
}
