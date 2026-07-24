import { FastifyRequest, FastifyReply } from 'fastify';
import jwksRsa from 'jwks-rsa';
import { createVerify } from 'crypto';

const CERTS_URL =
  process.env.KEYCLOAK_CERTS_URL ||
  'http://calendario-keycloak:8080/keycloak/realms/calendario/protocol/openid-connect/certs';

// Caché de JWKS para no pedir las claves en cada request
let jwksClient: jwksRsa.JwksClient | null = null;

function getJwksClient(): jwksRsa.JwksClient {
  if (!jwksClient) {
    jwksClient = jwksRsa({
      jwksUri: CERTS_URL,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600_000, // 10 min
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }
  return jwksClient;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

export interface JwtPayload {
  sub?: string;
  preferred_username?: string;
  email?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  realm_access?: { roles?: string[] };
  [key: string]: unknown;
}

export function hasAnyRole(user: JwtPayload | undefined, roles: string[]): boolean {
  const userRoles = user?.realm_access?.roles ?? [];
  return roles.some((r) => userRoles.includes(r));
}

function base64urlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padding), 'base64').toString('utf-8');
}

async function verifyJwt(token: string): Promise<JwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  const header: JwtHeader = JSON.parse(base64urlDecode(headerB64));
  const payload: JwtPayload = JSON.parse(base64urlDecode(payloadB64));

  // Verificar expiración
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    throw new Error('Token expired');
  }

  if (!header.kid) {
    throw new Error('Missing kid in JWT header');
  }

  // Obtener la clave pública desde Keycloak
  const client = getJwksClient();
  const key = await client.getSigningKey(header.kid);
  const publicKey = key.getPublicKey();

  // Verificar firma RS256
  const signingInput = `${headerB64}.${payloadB64}`;
  const sigBuffer = Buffer.from(
    signatureB64.replace(/-/g, '+').replace(/_/g, '/'),
    'base64',
  );

  const verifier = createVerify('RSA-SHA256');
  verifier.update(signingInput);
  const valid = verifier.verify(publicKey, sigBuffer);

  if (!valid) {
    throw new Error('Invalid JWT signature');
  }

  return payload;
}

// Extender el tipo de FastifyRequest para incluir user
declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;
  // Fallback: token como query param para preview (img/video/iframe no pueden poner headers)
  const queryToken = (request.query as Record<string, string | undefined>)['token'];

  let token: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (queryToken) {
    token = queryToken;
  }

  if (!token) {
    reply.code(401).send({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' });
    return;
  }

  try {
    const payload = await verifyJwt(token);
    request.user = payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token verification failed';
    reply.code(401).send({ error: 'Unauthorized', message });
  }
}
