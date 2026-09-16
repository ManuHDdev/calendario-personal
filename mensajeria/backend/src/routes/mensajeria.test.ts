import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// Genera un par de claves RSA "de mentira" y firma JWTs con ellas — ejercita
// el guard real de Keycloak (authMiddleware) sin un servidor JWKS real.
// Mismo patrón que ofertas/backend/src/routes/searches.test.ts.
const { adminJwt, invitadoJwt, sinRolJwt, publicKeyPem } = vi.hoisted(() => {
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
    invitadoJwt: signJwt({ realm_access: { roles: ['mensajeria_invitado'] }, exp }),
    sinRolJwt: signJwt({ realm_access: { roles: ['invitado'] }, exp }),
  };
});

vi.mock('../db/pool', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('jwks-rsa', () => ({
  default: vi.fn(() => ({
    getSigningKey: vi.fn(async () => ({ getPublicKey: () => publicKeyPem })),
  })),
}));

vi.mock('twilio', () => ({
  default: vi.fn(() => ({ messages: { create: vi.fn() }, calls: { create: vi.fn() } })),
}));

vi.mock('@sendgrid/mail', () => ({
  default: { setApiKey: vi.fn(), send: vi.fn() },
}));

import { pool } from '../db/pool';
import { mensajeriaRoutes } from './mensajeria';

const mockedQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

async function buildApp() {
  const app = Fastify();
  await app.register(mensajeriaRoutes);
  return app;
}

describe('mensajeriaRoutes — control de acceso por rol', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    delete process.env.MENSAJERIA_MODE;
  });

  describe('POST /send (escritura)', () => {
    it('rechaza un token sin admin ni mensajeria_admin (mensajeria_invitado incluido)', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/send',
        headers: { authorization: `Bearer ${invitadoJwt}` },
        payload: { channel: 'email', to: 'x@y.com', subject: 's', body: 'b' },
      });
      expect(res.statusCode).toBe(403);
      expect(mockedQuery).not.toHaveBeenCalled();
    });

    it('rechaza un token sin ninguno de los roles de mensajeria', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/send',
        headers: { authorization: `Bearer ${sinRolJwt}` },
        payload: { channel: 'email', to: 'x@y.com', subject: 's', body: 'b' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rechaza una petición sin token', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/send',
        payload: { channel: 'email', to: 'x@y.com', subject: 's', body: 'b' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('acepta admin y despacha al adaptador mock (mock-logged)', async () => {
      mockedQuery.mockResolvedValueOnce({
        rows: [{ id: 1, from_address: 'mensajeria@mock.local', to_address: 'x@y.com', subject: 's', text_body: 'b', html_body: null, received_at: 'now' }],
      });
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/send',
        headers: { authorization: `Bearer ${adminJwt}` },
        payload: { channel: 'email', to: 'x@y.com', subject: 's', body: 'b' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('mock-logged');
    });
  });

  describe('GET /inbox/emails (lectura)', () => {
    it('acepta mensajeria_invitado', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [] });
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/inbox/emails',
        headers: { authorization: `Bearer ${invitadoJwt}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('rechaza un token sin ninguno de los tres roles de mensajeria', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/inbox/emails',
        headers: { authorization: `Bearer ${sinRolJwt}` },
      });
      expect(res.statusCode).toBe(403);
      expect(mockedQuery).not.toHaveBeenCalled();
    });

    it('acepta admin', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [] });
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/inbox/emails',
        headers: { authorization: `Bearer ${adminJwt}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /inbox/log (lectura)', () => {
    it('rechaza un token sin rol de mensajeria', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/inbox/log',
        headers: { authorization: `Bearer ${sinRolJwt}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
