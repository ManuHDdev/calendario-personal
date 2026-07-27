import { FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'crypto';

// Segundo mecanismo de auth, completamente independiente del Keycloak JWT de
// middleware/auth.ts (ver design.md "Two separate auth mechanisms for two
// audiences"). Usado EXCLUSIVAMENTE por GET /ofertas/api/searches/active, la
// única ruta pensada para el scraper externo `marketplace-watcher`
// (headless, sin login interactivo posible). Un JWT de Keycloak válido NO
// debe pasar este guard, y este bearer token NO debe dar acceso a las rutas
// CRUD humanas — son dos audiencias distintas a propósito.

/**
 * Comprueba el bearer token estático contra SCRAPER_API_KEY. Función pura
 * para poder testearla sin construir un FastifyRequest real. Comparación en
 * tiempo constante (timingSafeEqual) porque es un secreto simple sin
 * expiración ni rotación automática — igual que la postura ya aceptada para
 * los tokens de vine-bot en este mismo VPS.
 */
export function isValidScraperToken(
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
 * Middleware Fastify que exige el bearer token estático de SCRAPER_API_KEY.
 * No parsea JWT, no llama a Keycloak/JWKS — solo compara el header
 * Authorization contra la env var.
 */
export function scraperAuthMiddleware() {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const expectedKey = process.env.SCRAPER_API_KEY;
    if (!isValidScraperToken(request.headers.authorization, expectedKey)) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
  };
}
