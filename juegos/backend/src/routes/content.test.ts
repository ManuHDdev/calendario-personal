import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

// Se mockea el middleware de auth para no depender de un JWT real firmado:
// las pruebas de este fichero validan el contrato de las rutas de
// contenido, no la verificación JWT (que ya tiene su propio test suite en
// middleware/auth.test.ts).
vi.mock('../middleware/auth', () => ({
  requireAuthenticated: async (
    request: { user?: unknown; headers: Record<string, string | undefined> },
    reply: { code: (n: number) => { send: (b: unknown) => void } },
  ) => {
    const role = request.headers['x-test-role'];
    if (!role) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    request.user = { realm_access: { roles: [role] } };
  },
}));

import { contentRoutes, __resetSessionsForTests } from './content';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(contentRoutes);
  return app;
}

describe('content routes', () => {
  beforeEach(() => __resetSessionsForTests());

  it('GET /impostor/word returns a word and category', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/juegos/api/impostor/word?sessionId=t1',
      headers: { 'x-test-role': 'invitado' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.word).toBe('string');
    expect(typeof body.category).toBe('string');
  });

  it('GET /impostor/word filters by categoria and only draws from that category', async () => {
    const app = await buildApp();
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/juegos/api/impostor/word?categoria=animales&sessionId=t2',
        headers: { 'x-test-role': 'admin' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().category).toBe('animales');
    }
  });

  it('GET /impostor/word rejects an unknown category with 400', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/juegos/api/impostor/word?categoria=noexiste&sessionId=t3',
      headers: { 'x-test-role': 'familia' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('allows all three roles (admin, familia, invitado) — no role check beyond a valid token', async () => {
    const app = await buildApp();
    for (const role of ['admin', 'familia', 'invitado']) {
      const res = await app.inject({
        method: 'GET',
        url: '/juegos/api/yo-nunca/prompt?sessionId=roles',
        headers: { 'x-test-role': role },
      });
      expect(res.statusCode).toBe(200);
    }
  });

  it('rejects a request without a token with 401', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/juegos/api/yo-nunca/prompt' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /yo-nunca/prompt returns a prompt string', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/juegos/api/yo-nunca/prompt?sessionId=t4',
      headers: { 'x-test-role': 'invitado' },
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().prompt).toBe('string');
  });

  it('GET /verdad-o-reto/prompt?tipo=verdad only returns verdad prompts', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/juegos/api/verdad-o-reto/prompt?tipo=verdad&sessionId=t5',
      headers: { 'x-test-role': 'invitado' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tipo).toBe('verdad');
  });

  it('GET /verdad-o-reto/prompt?tipo=reto only returns reto prompts', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/juegos/api/verdad-o-reto/prompt?tipo=reto&sessionId=t6',
      headers: { 'x-test-role': 'invitado' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tipo).toBe('reto');
  });

  it('GET /verdad-o-reto/prompt rejects an invalid tipo with 400', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/juegos/api/verdad-o-reto/prompt?tipo=nope&sessionId=t7',
      headers: { 'x-test-role': 'invitado' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('does not repeat impostor words within the same session before exhausting the small category pool is unlikely, but does not repeat across many draws for a large pool', async () => {
    const app = await buildApp();
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/juegos/api/impostor/word?sessionId=no-repeat-session',
        headers: { 'x-test-role': 'invitado' },
      });
      const word = res.json().word as string;
      if (seen.has(word)) {
        // Solo se permite un repetido si ya se agotó el banco completo (>=300)
        expect(seen.size).toBeGreaterThanOrEqual(300);
      }
      seen.add(word);
    }
  });
});
