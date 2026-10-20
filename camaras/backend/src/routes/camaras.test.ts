import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../db/pool', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

// El JWT real se prueba en cada subapp; aquí solo importa que cada ruta exija
// auth y que SOLO la imagen acepte el token por query (`allowQueryToken`).
vi.mock('../middleware/auth', () => ({
  authMiddleware: (_roles: string[], opciones: { allowQueryToken?: boolean } = {}) =>
    async (request: { headers: Record<string, string | undefined>; query: Record<string, string> }, reply: { code: (n: number) => { send: (b: unknown) => void } }) => {
      const cabecera = request.headers.authorization;
      const query = opciones.allowQueryToken ? request.query?.token : undefined;
      if (!cabecera && !query) {
        reply.code(401).send({ error: 'Unauthorized' });
      }
    },
}));

const capturar = vi.hoisted(() => vi.fn());
vi.mock('../services/imagenProxy', async (importOriginal) => {
  const real = await importOriginal<typeof import('../services/imagenProxy')>();
  return { ...real, crearCapturadorHttp: () => capturar };
});

import { pool } from '../db/pool';
import { camarasRoutes } from './camaras';
import { ImagenNoDisponibleError } from '../services/imagenProxy';

const consulta = pool.query as unknown as ReturnType<typeof vi.fn>;
const AUTH = { authorization: 'Bearer x' };

async function crearApp() {
  const app = Fastify();
  await app.register(camarasRoutes);
  return app;
}

const fila = {
  id: 1, origen: 'manual', external_id: null, nombre: 'Plaza', carretera: null, ciudad: 'caceres',
  latitud: 39.47, longitud: -6.37, distancia_km: null, url_imagen: 'https://origen.test/a.jpg',
  url_pagina: null, fuente: null, favorita: false, visto_en: null,
};

beforeEach(() => {
  consulta.mockReset();
  capturar.mockReset();
});

describe('autenticación', () => {
  it.each([
    ['GET', '/ciudades'], ['GET', '/camaras'], ['POST', '/camaras'], ['PATCH', '/camaras/1'],
    ['DELETE', '/camaras/1'], ['GET', '/estado'], ['POST', '/importacion'],
  ])('%s %s exige token', async (method, url) => {
    const app = await crearApp();
    const res = await app.inject({ method: method as 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(consulta).not.toHaveBeenCalled();
  });

  it('el token en la URL solo vale para la imagen', async () => {
    const app = await crearApp();
    expect((await app.inject({ method: 'GET', url: '/camaras?token=abc' })).statusCode).toBe(401);
    consulta.mockResolvedValueOnce({ rows: [] });
    expect((await app.inject({ method: 'GET', url: '/camaras/1/imagen?token=abc' })).statusCode).toBe(404);
  });
});

describe('GET /camaras', () => {
  it('devuelve DTOs sin la URL de origen', async () => {
    consulta.mockResolvedValueOnce({ rows: [fila] });
    const res = await (await crearApp()).inject({ method: 'GET', url: '/camaras?ciudad=caceres', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0]).toMatchObject({ id: 1, tieneImagen: true, fuente: 'Manual' });
    expect(res.body).not.toContain('origen.test');
    expect(consulta.mock.calls[0][0]).toContain('activo = true');
  });

  it('una ciudad desconocida es 400, no una lista vacía', async () => {
    const res = await (await crearApp()).inject({ method: 'GET', url: '/camaras?ciudad=atlantida', headers: AUTH });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /camaras', () => {
  it('crea una cámara manual', async () => {
    consulta.mockResolvedValueOnce({ rows: [fila] });
    const res = await (await crearApp()).inject({
      method: 'POST', url: '/camaras', headers: AUTH,
      payload: { nombre: 'Plaza', ciudad: 'caceres', latitud: 39.47, longitud: -6.37, urlImagen: 'https://origen.test/a.jpg' },
    });
    expect(res.statusCode).toBe(201);
    expect(consulta.mock.calls[0][0]).toContain("'manual'");
  });

  it('rechaza sin ninguna URL', async () => {
    const res = await (await crearApp()).inject({
      method: 'POST', url: '/camaras', headers: AUTH,
      payload: { nombre: 'Plaza', ciudad: 'caceres', latitud: 39.47, longitud: -6.37 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /camaras/:id', () => {
  it('una cámara de la DGT solo admite favorita', async () => {
    consulta.mockResolvedValueOnce({ rows: [{ origen: 'dgt', url_imagen: 'u', url_pagina: null }] });
    const res = await (await crearApp()).inject({ method: 'PATCH', url: '/camaras/1', headers: AUTH, payload: { nombre: 'otro' } });
    expect(res.statusCode).toBe(400);
    expect(consulta).toHaveBeenCalledTimes(1);
  });

  it('una cámara de la DGT sí puede marcarse favorita', async () => {
    consulta
      .mockResolvedValueOnce({ rows: [{ origen: 'dgt', url_imagen: 'u', url_pagina: null }] })
      .mockResolvedValueOnce({ rows: [{ ...fila, origen: 'dgt', favorita: true }] });
    const res = await (await crearApp()).inject({ method: 'PATCH', url: '/camaras/1', headers: AUTH, payload: { favorita: true } });
    expect(res.statusCode).toBe(200);
    expect(res.json().favorita).toBe(true);
  });

  it('no deja una cámara manual sin ninguna URL', async () => {
    consulta.mockResolvedValueOnce({ rows: [{ origen: 'manual', url_imagen: 'u', url_pagina: null }] });
    const res = await (await crearApp()).inject({ method: 'PATCH', url: '/camaras/1', headers: AUTH, payload: { urlImagen: null } });
    expect(res.statusCode).toBe(400);
  });

  it('404 si no existe o está borrada', async () => {
    consulta.mockResolvedValueOnce({ rows: [] });
    const res = await (await crearApp()).inject({ method: 'PATCH', url: '/camaras/9', headers: AUTH, payload: { favorita: true } });
    expect(res.statusCode).toBe(404);
  });

  it('cuerpo vacío es 400', async () => {
    const res = await (await crearApp()).inject({ method: 'PATCH', url: '/camaras/1', headers: AUTH, payload: {} });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /camaras/:id', () => {
  it('es borrado lógico: UPDATE activo=false, nunca DELETE', async () => {
    consulta.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await (await crearApp()).inject({ method: 'DELETE', url: '/camaras/1', headers: AUTH });
    expect(res.statusCode).toBe(204);
    const sql = consulta.mock.calls[0][0] as string;
    expect(sql).toContain('activo = false');
    expect(sql).toContain('deleted_at = NOW()');
    expect(sql).not.toMatch(/DELETE FROM/i);
  });

  it('404 si ya estaba borrada', async () => {
    consulta.mockResolvedValueOnce({ rows: [] });
    expect((await (await crearApp()).inject({ method: 'DELETE', url: '/camaras/1', headers: AUTH })).statusCode).toBe(404);
  });
});

describe('GET /camaras/:id/imagen', () => {
  it('sirve la imagen con cabeceras de seguridad', async () => {
    consulta.mockResolvedValueOnce({ rows: [{ url_imagen: 'https://origen.test/a.jpg' }] });
    capturar.mockResolvedValueOnce({ cuerpo: Buffer.from('JPEGDATA'), tipo: 'image/jpeg', capturadaEn: Date.now() });
    const res = await (await crearApp()).inject({ method: 'GET', url: '/camaras/7/imagen?token=abc' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain('sandbox');
    expect(res.body).toBe('JPEGDATA');
  });

  it('un origen caído es 502 (la cámara existe, falla el origen)', async () => {
    consulta.mockResolvedValueOnce({ rows: [{ url_imagen: 'https://origen.test/b.jpg' }] });
    capturar.mockRejectedValueOnce(new ImagenNoDisponibleError('El origen respondió HTTP 503'));
    const res = await (await crearApp()).inject({ method: 'GET', url: '/camaras/8/imagen?token=abc' });
    expect(res.statusCode).toBe(502);
  });

  it('una cámara solo con página (sin imagen) es 404', async () => {
    consulta.mockResolvedValueOnce({ rows: [{ url_imagen: null }] });
    expect((await (await crearApp()).inject({ method: 'GET', url: '/camaras/9/imagen?token=abc' })).statusCode).toBe(404);
  });
});
