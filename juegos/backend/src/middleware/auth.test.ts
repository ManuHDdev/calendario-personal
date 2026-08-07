import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';

// jwks-rsa se mockea porque las pruebas de requireAuthenticated no deben
// depender de una instancia real de Keycloak.
vi.mock('jwks-rsa', () => {
  return {
    default: () => ({
      getSigningKey: vi.fn().mockRejectedValue(new Error('no keys in test')),
    }),
  };
});

import { requireAuthenticated, extractToken } from './auth';

function fakeReply() {
  const reply: Partial<FastifyReply> & { statusCode?: number; body?: unknown } = {};
  reply.code = vi.fn((code: number) => {
    reply.statusCode = code;
    return reply as FastifyReply;
  });
  reply.send = vi.fn((body: unknown) => {
    reply.body = body;
    return reply as FastifyReply;
  });
  return reply as FastifyReply & { statusCode?: number; body?: unknown };
}

describe('extractToken', () => {
  it('reads the token from the Authorization header', () => {
    const req = { headers: { authorization: 'Bearer abc123' }, query: {} } as unknown as FastifyRequest;
    expect(extractToken(req)).toBe('abc123');
  });

  it('falls back to the ?token= query param (WS upgrade workaround)', () => {
    const req = { headers: {}, query: { token: 'xyz789' } } as unknown as FastifyRequest;
    expect(extractToken(req)).toBe('xyz789');
  });

  it('returns undefined when neither is present', () => {
    const req = { headers: {}, query: {} } as unknown as FastifyRequest;
    expect(extractToken(req)).toBeUndefined();
  });
});

describe('requireAuthenticated', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a request with no token with 401', async () => {
    const req = { headers: {}, query: {} } as unknown as FastifyRequest;
    const reply = fakeReply();
    await requireAuthenticated(req, reply);
    expect(reply.code).toHaveBeenCalledWith(401);
  });

  it('rejects a malformed JWT with 401 (no role check involved)', async () => {
    const req = { headers: { authorization: 'Bearer not-a-jwt' }, query: {} } as unknown as FastifyRequest;
    const reply = fakeReply();
    await requireAuthenticated(req, reply);
    expect(reply.code).toHaveBeenCalledWith(401);
  });

  it('does not perform any role check — it only requires a syntactically valid, non-expired token to reach verification', async () => {
    // Un JWT con formato válido pero firma que fallará el mock de jwks-rsa
    // sigue devolviendo 401 (fallo de verificación), nunca 403: confirma que
    // este guard no tiene ninguna rama de "Forbidden" por rol.
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-kid' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ realm_access: { roles: ['invitado'] }, exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString('base64url');
    const token = `${header}.${payload}.sig`;
    const req = { headers: { authorization: `Bearer ${token}` }, query: {} } as unknown as FastifyRequest;
    const reply = fakeReply();
    await requireAuthenticated(req, reply);
    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.code).not.toHaveBeenCalledWith(403);
  });
});
