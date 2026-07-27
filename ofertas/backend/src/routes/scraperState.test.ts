import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// Genera un par de claves RSA "de mentira" y firma JWTs con ellas — así se
// puede ejercitar el guard real de Keycloak (authMiddleware) sin depender de
// un servidor Keycloak/JWKS real. Se calcula con vi.hoisted porque las
// llamadas a vi.mock() de abajo se elevan por encima de este módulo y
// necesitan estos valores ya listos cuando se ejecutan sus factories.
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

// No hay infraestructura de tests de integración contra Postgres real en
// este subapp (ver db/queries.test.ts) — se mockea el pool.
vi.mock('../db/pool', () => ({
  pool: { query: vi.fn() },
}));

// authMiddleware verifica la firma contra JWKS real de Keycloak; se mockea
// jwks-rsa para que devuelva la clave pública generada arriba y así poder
// firmar JWTs válidos en el test.
vi.mock('jwks-rsa', () => ({
  default: vi.fn(() => ({
    getSigningKey: vi.fn(async () => ({ getPublicKey: () => publicKeyPem })),
  })),
}));

import { pool } from '../db/pool';
import { scraperStateRoutes } from './scraperState';

const mockedQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

async function buildApp() {
  const app = Fastify();
  await app.register(scraperStateRoutes);
  return app;
}

describe('scraperStateRoutes', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    process.env.SCRAPER_API_KEY = 'test-scraper-key';
  });

  describe('GET /scraper/state — Keycloak admin guard', () => {
    it('rejects a request without any token', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/scraper/state' });
      expect(res.statusCode).toBe(401);
    });

    it('rejects a valid JWT that does not have the admin role', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/scraper/state',
        headers: { authorization: `Bearer ${familiaJwt}` },
      });
      expect(res.statusCode).toBe(403);
      expect(mockedQuery).not.toHaveBeenCalled();
    });

    it('returns the current state for an admin', async () => {
      mockedQuery.mockResolvedValueOnce({
        rows: [{ running: true, updated_at: '2026-07-27T00:00:00.000Z' }],
      });
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/scraper/state',
        headers: { authorization: `Bearer ${adminJwt}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ running: true, updated_at: '2026-07-27T00:00:00.000Z' });
    });
  });

  describe('PATCH /scraper/state — body validation', () => {
    it('rejects a non-boolean running value', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'PATCH',
        url: '/scraper/state',
        headers: { authorization: `Bearer ${adminJwt}` },
        payload: { running: 'yes' },
      });
      expect(res.statusCode).toBe(400);
      expect(mockedQuery).not.toHaveBeenCalled();
    });

    it('rejects a non-admin JWT', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'PATCH',
        url: '/scraper/state',
        headers: { authorization: `Bearer ${familiaJwt}` },
        payload: { running: false },
      });
      expect(res.statusCode).toBe(403);
      expect(mockedQuery).not.toHaveBeenCalled();
    });

    it('updates and returns the new state for a valid boolean', async () => {
      mockedQuery.mockResolvedValueOnce({
        rows: [{ running: false, updated_at: '2026-07-27T01:00:00.000Z' }],
      });
      const app = await buildApp();
      const res = await app.inject({
        method: 'PATCH',
        url: '/scraper/state',
        headers: { authorization: `Bearer ${adminJwt}` },
        payload: { running: false },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ running: false, updated_at: '2026-07-27T01:00:00.000Z' });
    });
  });

  describe('GET /scraper/status — bearer token guard (marketplace-watcher)', () => {
    it('rejects a missing Authorization header', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/scraper/status' });
      expect(res.statusCode).toBe(401);
      expect(mockedQuery).not.toHaveBeenCalled();
    });

    it('rejects a wrong bearer token', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/scraper/status',
        headers: { authorization: 'Bearer wrong-token' },
      });
      expect(res.statusCode).toBe(401);
      expect(mockedQuery).not.toHaveBeenCalled();
    });

    it('rejects a valid Keycloak admin JWT — the two auth mechanisms never overlap', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/scraper/status',
        headers: { authorization: `Bearer ${adminJwt}` },
      });
      expect(res.statusCode).toBe(401);
      expect(mockedQuery).not.toHaveBeenCalled();
    });

    it('returns the current DB value with the correct bearer token', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [{ running: true, updated_at: '2026-07-27T00:00:00.000Z' }] });
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/scraper/status',
        headers: { authorization: 'Bearer test-scraper-key' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ running: true });
    });

    it('reflects running: false when the DB says the scraper is paused', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [{ running: false, updated_at: '2026-07-27T00:00:00.000Z' }] });
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/scraper/status',
        headers: { authorization: 'Bearer test-scraper-key' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ running: false });
    });
  });
});
