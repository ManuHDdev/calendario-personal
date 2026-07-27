import { FastifyRequest, FastifyReply } from 'fastify';
import jwksRsa from 'jwks-rsa';
import { createVerify } from 'crypto';

// Verificación JWT (RS256, hand-rolled vía JWKS de Keycloak) copiada de
// mapacyd/backend/src/middleware/auth.ts — misma duplicación aceptada y
// documentada en CLAUDE.md (no hay paquete compartido entre subapps, no se
// deduplica aquí). Igual que gastos/panel/storage/ytdl, usa la env var
// KEYCLOAK_CERTS_URL (en vez del KEYCLOAK_JWKS_URI propio de mapacyd) para
// seguir la convención mayoritaria del monorepo — así lo pide la lista de
// env vars documentada de ofertas.
//
// Este middleware protege exclusivamente las rutas humanas
// (/ofertas/api/searches*). El endpoint del scraper externo
// (GET /ofertas/api/searches/active) usa un mecanismo de auth totalmente
// distinto — ver middleware/scraperAuth.ts — y un JWT válido de Keycloak
// NUNCA debe dar acceso a esa ruta, igual que el bearer token del scraper
// NUNCA debe dar acceso a las rutas CRUD.
const CERTS_URL =
  process.env.KEYCLOAK_CERTS_URL ||
  'http://calendario-keycloak:8080/keycloak/realms/calendario/protocol/openid-connect/certs';

let jwksClient: jwksRsa.JwksClient | null = null;

function getJwksClient(): jwksRsa.JwksClient {
  if (!jwksClient) {
    jwksClient = jwksRsa({
      jwksUri: CERTS_URL,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600_000,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }
  return jwksClient;
}

interface JwtHeader { alg?: string; kid?: string }

export interface JwtPayload {
  sub?: string;
  preferred_username?: string;
  email?: string;
  exp?: number;
  realm_access?: { roles?: string[] };
  [key: string]: unknown;
}

function base64urlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padding), 'base64').toString('utf-8');
}

async function verifyJwt(token: string): Promise<JwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');
  const [headerB64, payloadB64, signatureB64] = parts;
  const header: JwtHeader = JSON.parse(base64urlDecode(headerB64));
  const payload: JwtPayload = JSON.parse(base64urlDecode(payloadB64));

  if (payload.exp && Date.now() / 1000 > payload.exp) throw new Error('Token expired');
  if (!header.kid) throw new Error('Missing kid in JWT header');

  const client = getJwksClient();
  const key = await client.getSigningKey(header.kid);
  const publicKey = key.getPublicKey();

  const signingInput = `${headerB64}.${payloadB64}`;
  const sigBuffer = Buffer.from(
    signatureB64.replace(/-/g, '+').replace(/_/g, '/'),
    'base64',
  );
  const verifier = createVerify('RSA-SHA256');
  verifier.update(signingInput);
  if (!verifier.verify(publicKey, sigBuffer)) throw new Error('Invalid JWT signature');

  return payload;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

/**
 * Comprueba si el usuario tiene alguno de los roles indicados. Función pura
 * (sin dependencias de red) para poder testearla sin mockear JWKS/HTTP.
 */
export function hasAnyRole(payload: JwtPayload, allowedRoles: string[]): boolean {
  const roles = payload.realm_access?.roles ?? [];
  return allowedRoles.some((r) => roles.includes(r));
}

/**
 * Middleware de autenticación y autorización.
 * Valida el JWT de Keycloak y comprueba que el usuario tenga al menos
 * uno de los roles permitidos indicados en `allowedRoles`.
 */
export function authMiddleware(allowedRoles: string[]) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    if (!token) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    try {
      const payload = await verifyJwt(token);
      if (!hasAnyRole(payload, allowedRoles)) {
        reply.code(403).send({
          error: 'Forbidden',
          message: `Se requiere uno de los roles: ${allowedRoles.join(', ')}`,
        });
        return;
      }
      request.user = payload;
    } catch (err) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: err instanceof Error ? err.message : 'Token error',
      });
    }
  };
}
