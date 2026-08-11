import { FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { verifyJwt, hasAnyRole } from './auth';

// Segunda vía de autorización de reparto, independiente del JWT de Keycloak
// (ver design.md "Autorización por grupo: token opaco de grupo, no de
// miembro" y "Rutas y guards: tres niveles"). Dos piezas distintas conviven
// aquí, a propósito:
//
// 1. `access_token` — token opaco de alta entropía, persistido en
//    `"group".access_token`, generado una vez al crear el grupo (o al
//    rotarlo). Es el que va en el enlace compartible. Se resuelve comparando
//    en tiempo constante (mismo patrón que ofertas/SCRAPER_API_KEY).
// 2. Token de sesión de grupo — de corta vida, firmado con HMAC-SHA256 y
//    `REPARTO_GROUP_TOKEN_SECRET`, emitido tras validar (1) en
//    `POST /groups/by-token`. Es lo que el cliente reenvía en
//    `Authorization: Bearer <...>` en las siguientes llamadas, para no tener
//    que reenviar el `access_token` completo en cada petición. No es un JWT
//    de librería — es un "payload firmado" simple, coherente con el estilo
//    de crypto hand-rolled ya usado en middleware/auth.ts.

const DEFAULT_TTL_SECONDS = 60 * 60; // 1h — sesión de grupo de corta vida (design.md)

export function generateAccessToken(): string {
  return randomBytes(24).toString('base64url');
}

function getGroupTokenSecret(): string {
  const secret = process.env.REPARTO_GROUP_TOKEN_SECRET;
  if (!secret) {
    throw new Error('REPARTO_GROUP_TOKEN_SECRET no está configurado');
  }
  return secret;
}

function base64urlEncode(input: string): string {
  return Buffer.from(input, 'utf-8').toString('base64url');
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf-8');
}

interface GroupSessionPayload {
  groupId: string;
  exp: number; // epoch seconds
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

/**
 * Emite un token de sesión de grupo de corta vida: `<payload-b64>.<hmac-b64>`.
 * Función pura (secreto e TTL inyectados) para poder testearla sin depender
 * de variables de entorno globales.
 */
export function signGroupSessionToken(
  groupId: string,
  secret: string = getGroupTokenSecret(),
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
  const payload: GroupSessionPayload = {
    groupId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signature = sign(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

/**
 * Verifica un token de sesión de grupo: comprueba la firma en tiempo
 * constante y la expiración. Devuelve el payload si es válido, `null` en
 * cualquier otro caso (formato inválido, firma incorrecta, expirado).
 */
export function verifyGroupSessionToken(
  token: string,
  secret: string = getGroupTokenSecret(),
): GroupSessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signatureB64] = parts;

  const expectedSignature = sign(payloadB64, secret);
  const providedBuf = Buffer.from(signatureB64);
  const expectedBuf = Buffer.from(expectedSignature);
  if (providedBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(providedBuf, expectedBuf)) return null;

  let payload: GroupSessionPayload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64));
  } catch {
    return null;
  }
  if (typeof payload.groupId !== 'string' || typeof payload.exp !== 'number') return null;
  if (Math.floor(Date.now() / 1000) > payload.exp) return null;

  return payload;
}

/**
 * Compara un `access_token` candidato contra el `access_token` real de un
 * grupo en tiempo constante (crypto.timingSafeEqual), mismo patrón que
 * ofertas/SCRAPER_API_KEY. Función pura para poder testearla sin BD.
 */
export function isMatchingAccessToken(candidate: string, actual: string): boolean {
  const candidateBuf = Buffer.from(candidate);
  const actualBuf = Buffer.from(actual);
  if (candidateBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(candidateBuf, actualBuf);
}

declare module 'fastify' {
  interface FastifyRequest {
    groupId?: string;
  }
}

/**
 * `preHandler` que exige un token de sesión de grupo válido (cualquier
 * grupo) y expone `request.groupId`. No usado directamente en las rutas de
 * gastos/miembros (ver `authOrGroupToken` más abajo, que compone este nivel
 * con el JWT de Keycloak) — se deja exportado para tests unitarios y por si
 * una ruta futura necesita SOLO este nivel.
 */
export function groupTokenMiddleware() {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    if (!token) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    const payload = verifyGroupSessionToken(token);
    if (!payload) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Token de sesión de grupo inválido o expirado' });
      return;
    }
    request.groupId = payload.groupId;
  };
}

const DEFAULT_COMBINED_ROLES = ['admin', 'reparto_admin', 'reparto_invitado'];

/**
 * `preHandler` compuesto (design.md "Rutas y guards: tres niveles"): prueba
 * primero el JWT de Keycloak con los roles permitidos; si no hay token, no es
 * un JWT válido, o el rol no basta, prueba el token de sesión de grupo válido
 * para el `:id` (o el nombre de parámetro indicado) de la ruta. Si ninguno
 * vale → 401. Si el token de grupo es válido pero para OTRO grupo → 403
 * (spec.md "Token for a different group rejected").
 */
export function authOrGroupToken(
  groupIdParam: string = 'id',
  allowedRoles: string[] = DEFAULT_COMBINED_ROLES,
) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const params = request.params as Record<string, string>;
    const routeGroupId = params[groupIdParam];

    if (!token) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    // 1) Intenta JWT de Keycloak.
    try {
      const payload = await verifyJwt(token);
      if (hasAnyRole(payload, allowedRoles)) {
        request.user = payload;
        return;
      }
      // JWT válido pero sin rol suficiente: no se corta aquí — puede que el
      // mismo bearer sea, en realidad, un token de sesión de grupo (no un
      // JWT), así que se sigue probando el segundo mecanismo.
    } catch {
      // No es un JWT válido de Keycloak — se prueba como token de grupo.
    }

    // 2) Intenta token de sesión de grupo.
    const sessionPayload = verifyGroupSessionToken(token);
    if (sessionPayload) {
      if (sessionPayload.groupId !== routeGroupId) {
        reply.code(403).send({ error: 'Forbidden', message: 'Token de grupo no válido para este grupo' });
        return;
      }
      request.groupId = sessionPayload.groupId;
      return;
    }

    reply.code(401).send({ error: 'Unauthorized' });
  };
}
