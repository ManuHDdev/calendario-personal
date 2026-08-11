import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateAccessToken,
  signGroupSessionToken,
  verifyGroupSessionToken,
  isMatchingAccessToken,
  authOrGroupToken,
} from './groupToken';
import type { FastifyReply, FastifyRequest } from 'fastify';

const SECRET = 'test-secret-do-not-use-in-prod';

describe('generateAccessToken', () => {
  it('generates a high-entropy base64url token', () => {
    const token = generateAccessToken();
    expect(token.length).toBeGreaterThan(20);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates different tokens on each call', () => {
    expect(generateAccessToken()).not.toBe(generateAccessToken());
  });
});

describe('isMatchingAccessToken', () => {
  it('accepts a matching token', () => {
    expect(isMatchingAccessToken('abc123', 'abc123')).toBe(true);
  });

  it('rejects a non-matching token of the same length', () => {
    expect(isMatchingAccessToken('abc123', 'abc124')).toBe(false);
  });

  it('rejects tokens of different length without throwing', () => {
    expect(isMatchingAccessToken('short', 'a-much-longer-token')).toBe(false);
  });
});

describe('signGroupSessionToken / verifyGroupSessionToken', () => {
  it('round-trips a valid token', () => {
    const token = signGroupSessionToken('group-123', SECRET, 3600);
    const payload = verifyGroupSessionToken(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload?.groupId).toBe('group-123');
  });

  it('rejects a token signed with a different secret', () => {
    const token = signGroupSessionToken('group-123', 'other-secret', 3600);
    expect(verifyGroupSessionToken(token, SECRET)).toBeNull();
  });

  it('rejects a tampered payload (groupId swapped)', () => {
    const token = signGroupSessionToken('group-123', SECRET, 3600);
    const [payloadB64, signature] = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ groupId: 'group-999', exp: 9999999999 })).toString(
      'base64url',
    );
    const tampered = `${tamperedPayload}.${signature}`;
    expect(verifyGroupSessionToken(tampered, SECRET)).toBeNull();
    // sanity: original still valid
    expect(verifyGroupSessionToken(`${payloadB64}.${signature}`, SECRET)).not.toBeNull();
  });

  it('rejects an expired token', () => {
    const token = signGroupSessionToken('group-123', SECRET, -10);
    expect(verifyGroupSessionToken(token, SECRET)).toBeNull();
  });

  it('rejects a malformed token', () => {
    expect(verifyGroupSessionToken('not-a-valid-token', SECRET)).toBeNull();
    expect(verifyGroupSessionToken('a.b.c', SECRET)).toBeNull();
  });
});

// authOrGroupToken combina el JWT de Keycloak (middleware/auth.ts) con el
// token de sesión de grupo. Se mockea verifyJwt para cubrir las tres
// combinaciones de spec.md sin depender de JWKS/red.
vi.mock('./auth', async () => {
  const actual = await vi.importActual<typeof import('./auth')>('./auth');
  return {
    ...actual,
    verifyJwt: vi.fn(),
  };
});

import { verifyJwt } from './auth';

function makeReply() {
  const reply = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    code(code: number) {
      reply.statusCode = code;
      return reply;
    },
    send(body: unknown) {
      reply.body = body;
      return reply;
    },
  };
  return reply as unknown as FastifyReply & { statusCode?: number; body?: unknown };
}

function makeRequest(token: string | undefined, groupIdParam: string): FastifyRequest {
  return {
    headers: { authorization: token ? `Bearer ${token}` : undefined },
    params: { id: groupIdParam },
  } as unknown as FastifyRequest;
}

describe('authOrGroupToken', () => {
  beforeEach(() => {
    vi.mocked(verifyJwt).mockReset();
    process.env.REPARTO_GROUP_TOKEN_SECRET = SECRET;
  });

  it('accepts a valid Keycloak JWT with an allowed role', async () => {
    vi.mocked(verifyJwt).mockResolvedValue({ realm_access: { roles: ['reparto_admin'] } });
    const request = makeRequest('valid-jwt', 'group-1');
    const reply = makeReply();
    await authOrGroupToken('id')(request, reply);
    expect(reply.statusCode).toBeUndefined();
    expect(request.user).toBeDefined();
  });

  it('accepts a valid group session token for the matching group', async () => {
    vi.mocked(verifyJwt).mockRejectedValue(new Error('not a jwt'));
    const groupToken = signGroupSessionToken('group-1', SECRET);
    const request = makeRequest(groupToken, 'group-1');
    const reply = makeReply();
    await authOrGroupToken('id')(request, reply);
    expect(reply.statusCode).toBeUndefined();
    expect(request.groupId).toBe('group-1');
  });

  it('rejects when neither JWT nor group token is valid', async () => {
    vi.mocked(verifyJwt).mockRejectedValue(new Error('not a jwt'));
    const request = makeRequest('garbage-token', 'group-1');
    const reply = makeReply();
    await authOrGroupToken('id')(request, reply);
    expect(reply.statusCode).toBe(401);
  });

  it('rejects with 401 when no Authorization header is present', async () => {
    const request = makeRequest(undefined, 'group-1');
    const reply = makeReply();
    await authOrGroupToken('id')(request, reply);
    expect(reply.statusCode).toBe(401);
  });

  it('rejects a valid group token scoped to a different group with 403', async () => {
    vi.mocked(verifyJwt).mockRejectedValue(new Error('not a jwt'));
    const groupToken = signGroupSessionToken('group-A', SECRET);
    const request = makeRequest(groupToken, 'group-B');
    const reply = makeReply();
    await authOrGroupToken('id')(request, reply);
    expect(reply.statusCode).toBe(403);
  });

  it('falls back to group token when JWT is valid but role is insufficient', async () => {
    vi.mocked(verifyJwt).mockResolvedValue({ realm_access: { roles: ['familia'] } });
    const groupToken = signGroupSessionToken('group-1', SECRET);
    const request = makeRequest(groupToken, 'group-1');
    const reply = makeReply();
    await authOrGroupToken('id')(request, reply);
    expect(reply.statusCode).toBeUndefined();
    expect(request.groupId).toBe('group-1');
  });
});
