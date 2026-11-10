import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// Mismo patrón que usage.test.ts: JWTs firmados con una clave RSA de mentira
// para ejercitar authAdminMiddleware sin Keycloak/JWKS real.
const { adminJwt, familiaJwt, publicKeyPem } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { generateKeyPairSync, sign } = require('crypto') as typeof import('crypto');
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  const base64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');
  function signJwt(payload: Record<string, unknown>): string {
    const header = { alg: 'RS256', kid: 'test-kid', typ: 'JWT' };
    const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    return `${signingInput}.${base64url(sign('RSA-SHA256', Buffer.from(signingInput), privateKey))}`;
  }

  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    publicKeyPem: pem,
    adminJwt: signJwt({ realm_access: { roles: ['admin'] }, exp }),
    familiaJwt: signJwt({ realm_access: { roles: ['familia'] }, exp }),
  };
});

vi.mock('jwks-rsa', () => ({
  default: vi.fn(() => ({
    getSigningKey: vi.fn(async () => ({ getPublicKey: () => publicKeyPem })),
  })),
}));

vi.mock('../services/keycloakAdmin', () => ({
  listUsers: vi.fn(),
  listPresence: vi.fn(),
  listRoles: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
}));

import { listPresence, listUsers } from '../services/keycloakAdmin';
import { usersRoutes } from './users';

const mockedListPresence = listPresence as unknown as ReturnType<typeof vi.fn>;
const mockedListUsers = listUsers as unknown as ReturnType<typeof vi.fn>;

async function buildApp() {
  const app = Fastify();
  await app.register(usersRoutes);
  return app;
}

describe('GET /panel/api/users/presence', () => {
  beforeEach(() => {
    mockedListPresence.mockReset();
    mockedListUsers.mockReset();
  });

  it('rejects a request without a token', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/panel/api/users/presence' });
    expect(res.statusCode).toBe(401);
    expect(mockedListPresence).not.toHaveBeenCalled();
  });

  it('rejects a valid JWT without the admin role', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/panel/api/users/presence',
      headers: { authorization: `Bearer ${familiaJwt}` },
    });
    expect(res.statusCode).toBe(403);
    expect(mockedListPresence).not.toHaveBeenCalled();
  });

  it('returns the presence map for an admin, without touching the user list route', async () => {
    const fixture = {
      'u-1': { status: 'online', lastActivity: 1_800_000_000_000 },
      'u-2': { status: 'offline', lastActivity: null },
    };
    mockedListPresence.mockResolvedValueOnce(fixture);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/panel/api/users/presence',
      headers: { authorization: `Bearer ${adminJwt}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(fixture);
    expect(mockedListUsers).not.toHaveBeenCalled();
  });

  it('answers 500 with the error message when Keycloak fails', async () => {
    mockedListPresence.mockRejectedValueOnce(new Error('Failed to list users: 503'));

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/panel/api/users/presence',
      headers: { authorization: `Bearer ${adminJwt}` },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Failed to list users: 503' });
  });
});
