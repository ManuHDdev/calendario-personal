import { describe, it, expect } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registrarParserJsonToleranteAVacio } from './jsonBody';

async function appDePrueba(): Promise<FastifyInstance> {
  const app = Fastify();
  registrarParserJsonToleranteAVacio(app);
  app.post('/eco', async (req) => ({ body: req.body ?? null }));
  await app.ready();
  return app;
}

describe('parser JSON tolerante a cuerpo vacío', () => {
  it('acepta application/json sin cuerpo y deja request.body indefinido', async () => {
    const app = await appDePrueba();
    const res = await app.inject({
      method: 'POST',
      url: '/eco',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ body: null });
    await app.close();
  });

  it('sigue parseando un cuerpo JSON válido', async () => {
    const app = await appDePrueba();
    const res = await app.inject({
      method: 'POST',
      url: '/eco',
      headers: { 'content-type': 'application/json' },
      payload: '{"a":1}',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ body: { a: 1 } });
    await app.close();
  });

  it('devuelve 400 con JSON mal formado', async () => {
    const app = await appDePrueba();
    const res = await app.inject({
      method: 'POST',
      url: '/eco',
      headers: { 'content-type': 'application/json' },
      payload: '{ roto',
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
