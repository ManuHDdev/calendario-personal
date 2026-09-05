import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { healthRoutes } from './health';

// El healthcheck existe para que `docker ps` diga la verdad. Su único
// comportamiento que importa es justo el que antes no tenía: fallar cuando
// la base de datos no responde.
async function buildApp(ping: () => Promise<void>) {
  const app = Fastify();
  await app.register(healthRoutes, { prefix: '/ofertas/api', ping });
  return app;
}

describe('GET /ofertas/api/health', () => {
  it('devuelve 200 cuando la base de datos responde', async () => {
    const app = await buildApp(async () => {});
    const res = await app.inject({ method: 'GET', url: '/ofertas/api/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', db: 'ok' });
    await app.close();
  });

  it('devuelve 503 cuando la base de datos no responde', async () => {
    const app = await buildApp(async () => {
      throw new Error('connect ECONNREFUSED 172.18.0.5:5432');
    });
    const res = await app.inject({ method: 'GET', url: '/ofertas/api/health' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'degraded', db: 'error' });
    await app.close();
  });

  it('no filtra el detalle del error de pg: /health es la unica ruta sin auth', async () => {
    const app = await buildApp(async () => {
      throw new Error('password authentication failed for user "ofertas"');
    });
    const res = await app.inject({ method: 'GET', url: '/ofertas/api/health' });

    expect(JSON.stringify(res.json())).not.toContain('password');
    expect(JSON.stringify(res.json())).not.toContain('ofertas"');
    await app.close();
  });
});
