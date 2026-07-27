import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// Genera un par de claves RSA "de mentira" y firma JWTs con ellas — así se
// puede ejercitar el guard real de Keycloak (authMiddleware) sin depender de
// un servidor Keycloak/JWKS real. Mismo patrón que routes/scraperState.test.ts.
const { adminJwt, publicKeyPem } = vi.hoisted(() => {
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
  };
});

// No hay infraestructura de tests de integración contra Postgres real en
// este subapp (ver db/queries.test.ts) — se mockea el pool.
vi.mock('../db/pool', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('jwks-rsa', () => ({
  default: vi.fn(() => ({
    getSigningKey: vi.fn(async () => ({ getPublicKey: () => publicKeyPem })),
  })),
}));

import { pool } from '../db/pool';
import { searchesRoutes } from './searches';

const mockedQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

const baseRow = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Juegos DS baratos',
  keyword: 'juegos ds',
  precio_min: null,
  precio_max: 15,
  latitude: 39.4753,
  longitude: -6.3724,
  distance_km: 30,
  milanuncios_province_slug: null,
  language_filter: null,
  sitios: {
    wallapop: { enabled: true },
    milanuncios: { enabled: false },
    vinted: { enabled: false },
  },
  activo: true,
  deleted_at: null,
  created_at: '2026-07-27T00:00:00.000Z',
  updated_at: '2026-07-27T00:00:00.000Z',
};

const validCreateBody = {
  nombre: 'Juegos DS baratos',
  keyword: 'juegos ds',
  precio_max: 15,
  latitude: 39.4753,
  longitude: -6.3724,
  distance_km: 30,
  sitios: baseRow.sitios,
};

async function buildApp() {
  const app = Fastify();
  await app.register(searchesRoutes);
  return app;
}

describe('searchesRoutes', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    process.env.SCRAPER_API_KEY = 'test-scraper-key';
  });

  describe('POST /searches — language_filter', () => {
    it('persists a valid language_filter and returns it in the create response', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [{ ...baseRow, language_filter: 'es' }] });
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/searches',
        headers: { authorization: `Bearer ${adminJwt}` },
        payload: { ...validCreateBody, language_filter: 'es' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().language_filter).toBe('es');
      expect(mockedQuery.mock.calls[0][1]).toContain('es');
    });

    it('defaults to null when language_filter is omitted', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [{ ...baseRow, language_filter: null }] });
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/searches',
        headers: { authorization: `Bearer ${adminJwt}` },
        payload: validCreateBody,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().language_filter).toBeNull();
      expect(mockedQuery.mock.calls[0][1]).toContain(null);
    });

    it('accepts an explicit null language_filter', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [{ ...baseRow, language_filter: null }] });
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/searches',
        headers: { authorization: `Bearer ${adminJwt}` },
        payload: { ...validCreateBody, language_filter: null },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().language_filter).toBeNull();
    });

    it('rejects a malformed language_filter with a 400 and never touches the DB', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/searches',
        headers: { authorization: `Bearer ${adminJwt}` },
        payload: { ...validCreateBody, language_filter: 'spanish' },
      });
      expect(res.statusCode).toBe(400);
      expect(mockedQuery).not.toHaveBeenCalled();
    });

    it('rejects a numeric language_filter with a 400', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/searches',
        headers: { authorization: `Bearer ${adminJwt}` },
        payload: { ...validCreateBody, language_filter: 34 },
      });
      expect(res.statusCode).toBe(400);
      expect(mockedQuery).not.toHaveBeenCalled();
    });
  });

  describe('GET /searches — list includes language_filter', () => {
    it('returns language_filter in each listed row', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [{ ...baseRow, language_filter: 'es' }] });
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/searches',
        headers: { authorization: `Bearer ${adminJwt}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()[0].language_filter).toBe('es');
    });
  });

  describe('PATCH /searches/:id — language_filter', () => {
    it('updates language_filter and round-trips the new value', async () => {
      mockedQuery
        .mockResolvedValueOnce({ rows: [{ id: baseRow.id }] }) // existence check
        .mockResolvedValueOnce({ rows: [{ ...baseRow, language_filter: 'en' }] }); // update
      const app = await buildApp();
      const res = await app.inject({
        method: 'PATCH',
        url: `/searches/${baseRow.id}`,
        headers: { authorization: `Bearer ${adminJwt}` },
        payload: { language_filter: 'en' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().language_filter).toBe('en');
    });

    it('clears language_filter back to null via PATCH', async () => {
      mockedQuery
        .mockResolvedValueOnce({ rows: [{ id: baseRow.id }] })
        .mockResolvedValueOnce({ rows: [{ ...baseRow, language_filter: null }] });
      const app = await buildApp();
      const res = await app.inject({
        method: 'PATCH',
        url: `/searches/${baseRow.id}`,
        headers: { authorization: `Bearer ${adminJwt}` },
        payload: { language_filter: null },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().language_filter).toBeNull();
    });

    it('rejects a malformed language_filter on PATCH with a 400', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'PATCH',
        url: `/searches/${baseRow.id}`,
        headers: { authorization: `Bearer ${adminJwt}` },
        payload: { language_filter: 'xx-not-a-code' },
      });
      expect(res.statusCode).toBe(400);
      expect(mockedQuery).not.toHaveBeenCalled();
    });
  });

  describe('GET /searches/active — bearer-token DTO includes language_filter', () => {
    it('maps language_filter through to the scraper DTO', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [{ ...baseRow, language_filter: 'es' }] });
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/searches/active',
        headers: { authorization: 'Bearer test-scraper-key' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()[0].language_filter).toBe('es');
    });

    it('returns null language_filter when the search has none set', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [{ ...baseRow, language_filter: null }] });
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/searches/active',
        headers: { authorization: 'Bearer test-scraper-key' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()[0].language_filter).toBeNull();
    });
  });
});
