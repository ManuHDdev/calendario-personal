import { FastifyRequest, FastifyReply } from 'fastify';
import jwksRsa from 'jwks-rsa';
import { createVerify } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────
// Copiado (casi) verbatim de mapacyd/backend/src/middleware/auth.ts — misma
// duplicación aceptada que en el resto de subapps (ver CLAUDE.md, "JWT
// middleware duplicado"). Las únicas adiciones son requireAuthenticated() y
// extractToken() al final del fichero, necesarias porque juegos es la
// primera subapp abierta a cualquier rol autenticado y la primera con un
// upgrade WebSocket que recibe el JWT como query param (?token=), igual que
// storage/backend/src/middleware/auth.ts.
// ─────────────────────────────────────────────────────────────────────────

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
 * Middleware de autenticación y autorización con lista de roles permitidos.
 * Se conserva por paridad con mapacyd, aunque juegos no lo usa para ninguna
 * ruta HTTP (ver requireAuthenticated más abajo) — solo por si en el futuro
 * se necesitase alguna ruta restringida (p. ej. un futuro `juegos_admin`).
 */
export function authMiddleware(allowedRoles: string[]) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const token = extractToken(request);

    if (!token) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    try {
      const payload = await verifyJwt(token);
      const roles = payload.realm_access?.roles ?? [];
      const hasRole = allowedRoles.some((r) => roles.includes(r));
      if (!hasRole) {
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

/**
 * juegos es la primera subapp del monorepo abierta a cualquier rol
 * autenticado (admin, familia, invitado) — ver design.md "Access guard: any
 * valid role instead of a role allowlist". A propósito NO reutiliza
 * authMiddleware(['admin','familia','invitado']): ese patrón "under-granta"
 * silenciosamente si algún día se añade un rol nuevo al realm, mientras que
 * requireAuthenticated() expresa la intención real ("cualquiera con sesión")
 * sin depender de enumerar los roles existentes.
 */
export function requireAuthenticated(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  return (async () => {
    const token = extractToken(request);

    if (!token) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Missing or invalid token' });
      return;
    }

    try {
      const payload = await verifyJwt(token);
      request.user = payload;
    } catch (err) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: err instanceof Error ? err.message : 'Token error',
      });
    }
  })();
}

/**
 * Extrae el JWT de la cabecera Authorization (uso normal en peticiones HTTP)
 * o, si no está presente, del query param `token` — mismo workaround que
 * storage/backend/src/middleware/auth.ts usa para <img>/<video>, reutilizado
 * aquí porque el navegador nativo WebSocket tampoco puede fijar cabeceras
 * custom en el handshake de upgrade (ver design.md "WebSocket room layer").
 */
export function extractToken(request: FastifyRequest): string | undefined {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);

  const query = request.query as Record<string, string | undefined> | undefined;
  return query?.token;
}

/** Verifica un JWT crudo (usado por el handler de upgrade de WebSocket, que no pasa por preHandler). */
export async function verifyToken(token: string): Promise<JwtPayload> {
  return verifyJwt(token);
}
