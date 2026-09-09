import { FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'crypto';

// Segundo mecanismo de auth, completamente independiente del Keycloak JWT de
// middleware/auth.ts — mismo patrón que ofertas/middleware/scraperAuth.ts y
// paraisos/middleware/internalAuth.ts (ver
// openspec/changes/2026-09-09-add-api-usage-dashboard/design.md). Usado
// EXCLUSIVAMENTE por GET /watchlist/api/usage, el consumidor interno de Panel.
// Un JWT de Keycloak válido NO debe pasar este guard, y este bearer token NO
// debe dar acceso a ninguna otra ruta.

/**
 * Comprueba el bearer token estático contra PANEL_INTERNAL_TOKEN. Función
 * pura para poder testearla sin construir un FastifyRequest real.
 * Comparación en tiempo constante (timingSafeEqual).
 */
export function isValidInternalToken(
  authHeader: string | undefined,
  expectedKey: string | undefined,
): boolean {
  if (!expectedKey) return false;

  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  if (!token) return false;

  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expectedKey);
  if (tokenBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(tokenBuf, expectedBuf);
}

/**
 * Middleware Fastify que exige el bearer token estático de PANEL_INTERNAL_TOKEN.
 * No parsea JWT, no llama a Keycloak/JWKS — solo compara el header
 * Authorization contra la env var.
 */
export function internalAuthMiddleware() {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const expectedKey = process.env.PANEL_INTERNAL_TOKEN;
    if (!isValidInternalToken(request.headers.authorization, expectedKey)) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
  };
}
