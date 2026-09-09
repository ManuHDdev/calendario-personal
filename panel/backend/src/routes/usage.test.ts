import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// Genera un par de claves RSA "de mentira" y firma JWTs con ellas — mismo
// patrón que ofertas/backend/src/routes/scraperState.test.ts, para poder
// ejercitar authAdminMiddleware sin un servidor Keycloak/JWKS real.
const { adminJwt, familiaJwt, publicKeyPem } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { generateKeyPairSync, sign } = require('crypto') as typeof import('crypto');
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  function base64url(input: Buffer | string): string {
    return Buffer.from(input).toString('base64url');
  }

  function signJwt(payload: Record<string, unknown>): string {
    const header = { alg: 'RS256', kid: 'test-kid', typ: 'JWT' };
    const headerB64 = base64url(JSON.stringify(header));
    const payloadB64 = base64url(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKey);
    return `${signingInput}.${base64url(signature)}`;
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

vi.mock('../services/subappUsage', () => ({
  getAllUsage: vi.fn(),
}));

import { getAllUsage } from '../services/subappUsage';
import { usageRoutes } from './usage';

const mockedGetAllUsage = getAllUsage as unknown as ReturnType<typeof vi.fn>;

async function buildApp() {
  const app = Fastify();
  await app.register(usageRoutes);
  return app;
}

describe('GET /panel/api/usage', () => {
  beforeEach(() => {
    mockedGetAllUsage.mockReset();
  });

  it('rejects a request without a token', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/panel/api/usage' });
    expect(res.statusCode).toBe(401);
    expect(mockedGetAllUsage).not.toHaveBeenCalled();
  });

  it('rejects a valid JWT without the admin role', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/panel/api/usage',
      headers: { authorization: `Bearer ${familiaJwt}` },
    });
    expect(res.statusCode).toBe(403);
    expect(mockedGetAllUsage).not.toHaveBeenCalled();
  });

  it('returns the aggregated usage for an admin', async () => {
    const fixture = [
      { api: 'ors', label: 'OpenRouteService', callsToday: 10, dailyLimit: 2000, remaining: 1990, resetsAt: '2026-09-10T00:00:00.000Z', unavailable: false },
    ];
    mockedGetAllUsage.mockResolvedValueOnce(fixture);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/panel/api/usage',
      headers: { authorization: `Bearer ${adminJwt}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(fixture);
  });
});
