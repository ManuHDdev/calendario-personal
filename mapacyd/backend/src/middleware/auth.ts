import { FastifyRequest, FastifyReply } from 'fastify';
import jwksRsa from 'jwks-rsa';
import { createVerify } from 'crypto';

const CERTS_URL =
  process.env.KEYCLOAK_JWKS_URI ||
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
