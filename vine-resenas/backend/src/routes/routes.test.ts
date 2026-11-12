import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app';
import { apiTokenMiddleware } from '../middleware/bearerAuth';
import { FakeRepo, FakeStore } from '../testing/fakes';
import type { Hook } from './deps';

const TOKEN = 'test-api-token-0123456789abcdef';
const ASIN = 'B0FQBYHJ17';
const API = '/vine-resenas/api/v1';
const UI = '/vine-resenas/api/ui';
const auth = { authorization: `Bearer ${TOKEN}` };

let app: FastifyInstance;
let repo: FakeRepo;
let store: FakeStore;
const fetcher = vi.fn();

// UI auth is Keycloak in production; here the hooks let everything through,
// except `deny`, which models a missing role.
const allow: Hook = async () => undefined;

beforeEach(async () => {
  repo = new FakeRepo();
  repo.seed({ asin: ASIN, titulo: 'Brochetas' });
  store = new FakeStore();
  fetcher.mockReset();
  app = await buildApp({
    repo,
    store,
    fetcher,
    syncConfig: () => ({ botUrl: 'http://bot', botToken: 'x' }),
    auth: { read: allow, readMedia: allow, write: allow, api: apiTokenMiddleware(() => TOKEN) },
  });
});
afterEach(() => app.close());

function multipart(files: { name: string; type: string; data: string }[]) {
  const boundary = '----vinetest';
  const parts = files.map(
    (f) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${f.name}"\r\nContent-Type: ${f.type}\r\n\r\n${f.data}\r\n`,
  );
  return {
    payload: parts.join('') + `--${boundary}--\r\n`,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('Claude API auth', () => {
  it('rejects missing and wrong tokens on every v1 route', async () => {
    for (const [method, url] of [
      ['GET', '/products'],
      ['GET', `/products/${ASIN}`],
      ['PUT', `/products/${ASIN}`],
      ['PUT', `/products/${ASIN}/resena`],
      ['POST', '/products/sync'],
      ['POST', `/products/${ASIN}/publicado`],
      ['GET', `/media/${ASIN}/1-a.jpg`],
    ] as const) {
      const none = await app.inject({ method, url: API + url });
      const bad = await app.inject({ method, url: API + url, headers: { authorization: 'Bearer nope' } });
      expect([none.statusCode, bad.statusCode]).toEqual([401, 401]);
      expect(none.json()).toMatchObject({ error: 'Unauthorized' });
    }
  });

  it('health is public', async () => {
    expect((await app.inject({ url: '/vine-resenas/api/health' })).statusCode).toBe(200);
  });
});

describe('Claude API', () => {
  it('lists products with media urls and filters by estado', async () => {
    repo.seed({ asin: 'AAAAAAAAAA', estado: 'listo' });
    await repo.addMedia({ asin: ASIN, filename: '1-a.jpg', type: 'photo', size: 3 });
    const all = (await app.inject({ url: `${API}/products`, headers: auth })).json();
    expect(all).toHaveLength(2);
    expect(all.find((p: { asin: string }) => p.asin === ASIN).media[0].url).toBe(`${API}/media/${ASIN}/1-a.jpg`);
    const listos = (await app.inject({ url: `${API}/products?estado=listo`, headers: auth })).json();
    expect(listos.map((p: { asin: string }) => p.asin)).toEqual(['AAAAAAAAAA']);
    expect((await app.inject({ url: `${API}/products?estado=bad`, headers: auth })).statusCode).toBe(400);
  });

  it('routes /products/sync to the sync handler, not to :asin', async () => {
    fetcher.mockResolvedValue([{ asin: 'CCCCCCCCCC', titulo: 'n', descripcion: 'd' }, { asin: ASIN, titulo: 'dup' }]);
    const res = await app.inject({ method: 'POST', url: `${API}/products/sync`, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ created: ['CCCCCCCCCC'], skipped: 1 });
  });

  it('reports a 503 JSON error when VINE_BOT_TOKEN is not configured', async () => {
    const noToken = await buildApp({
      repo,
      store,
      fetcher,
      syncConfig: () => ({ botUrl: 'http://bot' }),
      auth: { read: allow, readMedia: allow, write: allow, api: apiTokenMiddleware(() => TOKEN) },
    });
    const res = await noToken.inject({ method: 'POST', url: `${API}/products/sync`, headers: auth });
    await noToken.close();
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'ServiceUnavailable', message: 'VINE_BOT_TOKEN not configured' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports a 502 {error,message} when the bot is down', async () => {
    fetcher.mockRejectedValue(new Error('boom'));
    const res = await app.inject({ method: 'POST', url: `${API}/products/sync`, headers: auth });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ error: 'BadGateway' });
  });

  it('PUT updates content and validates with zod', async () => {
    const ok = await app.inject({
      method: 'PUT', url: `${API}/products/${ASIN}`, headers: auth,
      payload: { feedback: 'Genial', estrellas: 5 },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ feedback: 'Genial', estrellas: 5, estado: 'pendiente' });
    const bad = await app.inject({ method: 'PUT', url: `${API}/products/${ASIN}`, headers: auth, payload: { estrellas: 9 } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ error: 'ValidationError' });
  });

  it('PUT estado=en_espera parks a product and the list filters by it; leaving to listo keeps the 409 rule', async () => {
    const put = await app.inject({ method: 'PUT', url: `${API}/products/${ASIN}`, headers: auth, payload: { estado: 'en_espera' } });
    expect(put.json()).toMatchObject({ estado: 'en_espera' });
    const list = await app.inject({ url: `${API}/products?estado=en_espera`, headers: auth });
    expect(list.json()).toHaveLength(1);
    const bad = await app.inject({ method: 'PUT', url: `${API}/products/${ASIN}`, headers: auth, payload: { estado: 'listo' } });
    expect(bad.statusCode).toBe(409);
    const ok = await app.inject({ method: 'PUT', url: `${API}/products/${ASIN}`, headers: auth, payload: { estado: 'listo', feedback: 'f', estrellas: 5 } });
    expect(ok.json()).toMatchObject({ estado: 'listo' });
  });

  it('PUT estado=listo needs feedback and stars (counting the same request)', async () => {
    const fail = await app.inject({ method: 'PUT', url: `${API}/products/${ASIN}`, headers: auth, payload: { estado: 'listo' } });
    expect(fail.statusCode).toBe(409);
    expect(fail.json()).toMatchObject({ error: 'ProductIncomplete' });
    const ok = await app.inject({
      method: 'PUT', url: `${API}/products/${ASIN}`, headers: auth,
      payload: { estado: 'listo', feedback: 'x', estrellas: 4 },
    });
    expect(ok.json()).toMatchObject({ estado: 'listo' });
  });

  it('PUT estado cannot reach resena_generada or publicado; publicado needs resena_generada', async () => {
    for (const estado of ['resena_generada', 'publicado']) {
      const res = await app.inject({ method: 'PUT', url: `${API}/products/${ASIN}`, headers: auth, payload: { estado } });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'InvalidTransition' });
    }
    const early = await app.inject({ method: 'POST', url: `${API}/products/${ASIN}/publicado`, headers: auth });
    expect(early.statusCode).toBe(409);
    expect(early.json().message).toMatch(/resena_generada/);
    expect(repo.products.get(ASIN)!.estado).toBe('pendiente');
    expect((await app.inject({ method: 'POST', url: `${UI}/products/${ASIN}/publicado` })).statusCode).toBe(409);
  });

  it('a published product can be reopened to resena_generada via PUT', async () => {
    repo.products.get(ASIN)!.estado = 'publicado';
    const res = await app.inject({ method: 'PUT', url: `${API}/products/${ASIN}`, headers: auth, payload: { estado: 'resena_generada' } });
    expect(res.json()).toMatchObject({ estado: 'resena_generada' });
  });

  it('resena stores the texts and sets resena_generada; publicado closes the cycle', async () => {
    const res = await app.inject({
      method: 'PUT', url: `${API}/products/${ASIN}/resena`, headers: auth,
      payload: { resena_producto: 'p', resena_resumida: 'r', resena_extendida: 'e' },
    });
    expect(res.json()).toMatchObject({ estado: 'resena_generada', resena_resumida: 'r' });
    const pub = await app.inject({ method: 'POST', url: `${API}/products/${ASIN}/publicado`, headers: auth });
    expect(pub.json()).toMatchObject({ estado: 'publicado' });
    const again = await app.inject({
      method: 'PUT', url: `${API}/products/${ASIN}/resena`, headers: auth,
      payload: { resena_resumida: 'r', resena_extendida: 'e' },
    });
    expect(again.statusCode).toBe(409);
  });

  it('resena on an en_espera product is 409 and leaves the product untouched', async () => {
    repo.products.get(ASIN)!.estado = 'en_espera';
    repo.products.get(ASIN)!.feedback = 'fb';
    repo.products.get(ASIN)!.estrellas = 4;
    const before = { ...repo.products.get(ASIN)! };
    const res = await app.inject({
      method: 'PUT', url: `${API}/products/${ASIN}/resena`, headers: auth,
      payload: { resena_producto: 'p', resena_resumida: 'r', resena_extendida: 'e' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'InvalidTransition' });
    expect(res.json().message).toMatch(/stand-by/);
    expect(repo.products.get(ASIN)).toEqual(before);
  });

  it('answers 404 for unknown products and 400 for bad ASINs', async () => {
    expect((await app.inject({ url: `${API}/products/ZZZZZZZZZZ`, headers: auth })).statusCode).toBe(404);
    expect((await app.inject({ url: `${API}/products/bad`, headers: auth })).statusCode).toBe(400);
  });

  it('serves media with Range support', async () => {
    store.files.set(`${ASIN}/1-v.mp4`, Buffer.from('0123456789'));
    await repo.addMedia({ asin: ASIN, filename: '1-v.mp4', type: 'video', size: 10 });
    const full = await app.inject({ url: `${API}/media/${ASIN}/1-v.mp4`, headers: auth });
    expect(full.statusCode).toBe(200);
    expect(full.headers['content-type']).toBe('video/mp4');
    const part = await app.inject({ url: `${API}/media/${ASIN}/1-v.mp4`, headers: { ...auth, range: 'bytes=2-4' } });
    expect(part.statusCode).toBe(206);
    expect(part.body).toBe('234');
    expect(part.headers['content-range']).toBe('bytes 2-4/10');
    const bad = await app.inject({ url: `${API}/media/${ASIN}/1-v.mp4`, headers: { ...auth, range: 'bytes=50-' } });
    expect(bad.statusCode).toBe(416);
    expect((await app.inject({ url: `${API}/media/${ASIN}/..%2f..%2fx.jpg`, headers: auth })).statusCode).toBe(400);
  });
});

describe('UI routes', () => {
  it('autosave PUT never changes the estado, even if the client sends one', async () => {
    repo.products.get(ASIN)!.estado = 'listo';
    const res = await app.inject({
      method: 'PUT', url: `${UI}/products/${ASIN}`,
      payload: { feedback: 'editado', estado: 'publicado' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ feedback: 'editado', estado: 'listo' });
  });

  it('listo / publicado endpoints follow the state machine', async () => {
    expect((await app.inject({ method: 'POST', url: `${UI}/products/${ASIN}/listo` })).statusCode).toBe(409);
    await app.inject({ method: 'PUT', url: `${UI}/products/${ASIN}`, payload: { feedback: 'ok', estrellas: 3 } });
    expect((await app.inject({ method: 'POST', url: `${UI}/products/${ASIN}/listo` })).json()).toMatchObject({ estado: 'listo' });
    expect((await app.inject({ method: 'POST', url: `${UI}/products/${ASIN}/publicado` })).statusCode).toBe(409);
    repo.products.get(ASIN)!.estado = 'resena_generada';
    expect((await app.inject({ method: 'POST', url: `${UI}/products/${ASIN}/publicado` })).json()).toMatchObject({ estado: 'publicado' });
  });

  it('en_espera: park via /espera, hidden from other views, own filter, count, resume', async () => {
    await app.inject({ method: 'PUT', url: `${UI}/products/${ASIN}`, payload: { feedback: 'ok', estrellas: 3 } });
    repo.seed({ asin: 'GGGGGGGGGG', titulo: 'Sin nada' });
    const park = await app.inject({ method: 'POST', url: `${UI}/products/${ASIN}/espera` });
    expect(park.json()).toMatchObject({ estado: 'en_espera', feedback: 'ok', estrellas: 3 });
    const all = (await app.inject({ url: `${UI}/products` })).json();
    expect(all.map((p: { asin: string }) => p.asin)).toEqual(['GGGGGGGGGG']);
    const parked = (await app.inject({ url: `${UI}/products?filter=en_espera` })).json();
    expect(parked.map((p: { asin: string }) => p.asin)).toEqual([ASIN]);
    expect((await app.inject({ url: `${UI}/counts` })).json()).toMatchObject({ en_espera: 1, pendiente: 1, total: 2 });
    // a ready product resumes to listo
    expect((await app.inject({ method: 'POST', url: `${UI}/products/${ASIN}/reanudar` })).json()).toMatchObject({ estado: 'listo', feedback: 'ok' });
    // an incomplete product resumes to pendiente
    await app.inject({ method: 'POST', url: `${UI}/products/GGGGGGGGGG/espera` });
    expect((await app.inject({ method: 'POST', url: `${UI}/products/GGGGGGGGGG/reanudar` })).json()).toMatchObject({ estado: 'pendiente' });
    // resuming something that is not parked is a 409
    expect((await app.inject({ method: 'POST', url: `${UI}/products/GGGGGGGGGG/reanudar` })).statusCode).toBe(409);
  });

  it('en_espera cannot be entered from resena_generada or publicado', async () => {
    repo.products.get(ASIN)!.estado = 'resena_generada';
    expect((await app.inject({ method: 'POST', url: `${UI}/products/${ASIN}/espera` })).statusCode).toBe(409);
    repo.products.get(ASIN)!.estado = 'publicado';
    expect((await app.inject({ method: 'POST', url: `${UI}/products/${ASIN}/espera` })).statusCode).toBe(409);
  });

  it('lists summaries, hides publicado, and counts', async () => {
    repo.seed({ asin: 'EEEEEEEEEE', estado: 'publicado' });
    const list = (await app.inject({ url: `${UI}/products` })).json();
    expect(list.map((p: { asin: string }) => p.asin)).toEqual([ASIN]);
    const pub = (await app.inject({ url: `${UI}/products?estado=publicado` })).json();
    expect(pub).toHaveLength(1);
    expect((await app.inject({ url: `${UI}/counts` })).json()).toMatchObject({ pendientes: 1, publicado: 1, total: 2 });
  });

  it('uploads multiple photos, rejects bad ones per file, and replaces the video', async () => {
    const m1 = multipart([
      { name: 'a.jpg', type: 'image/jpeg', data: 'jpgdata' },
      { name: 'b.gif', type: 'image/gif', data: 'gif' },
      { name: 'c.mp4', type: 'video/mp4', data: 'video1' },
    ]);
    const r1 = await app.inject({ method: 'POST', url: `${UI}/products/${ASIN}/media`, ...m1 });
    expect(r1.statusCode).toBe(201);
    const b1 = r1.json();
    expect(b1.uploaded).toHaveLength(2);
    expect(b1.rejected).toEqual([expect.objectContaining({ filename: 'b.gif', error: 'UnsupportedMediaType' })]);

    const m2 = multipart([{ name: 'd.mov', type: 'video/quicktime', data: 'video2' }]);
    const r2 = await app.inject({ method: 'POST', url: `${UI}/products/${ASIN}/media`, ...m2 });
    expect(r2.json().replaced).toHaveLength(1);
    expect(repo.media.filter((m) => m.type === 'video')).toHaveLength(1);
    expect(repo.media.filter((m) => m.type === 'photo')).toHaveLength(1);
  });

  it('answers the failure status when nothing could be stored', async () => {
    const res = await app.inject({
      method: 'POST', url: `${UI}/products/${ASIN}/media`,
      ...multipart([{ name: 'x.exe', type: 'application/octet-stream', data: 'x' }]),
    });
    expect(res.statusCode).toBe(415);
    expect(res.json()).toMatchObject({ rejected: [expect.objectContaining({ error: 'UnsupportedMediaType' })] });
  });

  it('deletes media and 404s afterwards; list shows photo count and thumbnail', async () => {
    const up = await app.inject({
      method: 'POST', url: `${UI}/products/${ASIN}/media`,
      ...multipart([{ name: 'a.png', type: 'image/png', data: 'png' }]),
    });
    const filename = up.json().uploaded[0].filename;
    const list = (await app.inject({ url: `${UI}/products` })).json();
    expect(list[0]).toMatchObject({ photo_count: 1, has_video: false, thumbnail_url: `${UI}/media/${ASIN}/${filename}` });
    expect((await app.inject({ method: 'DELETE', url: `${UI}/products/${ASIN}/media/${filename}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `${UI}/products/${ASIN}/media/${filename}` })).statusCode).toBe(404);
  });
});

describe('UI role enforcement', () => {
  it('uses the injected hooks (a denying write hook blocks mutations)', async () => {
    const deny: Hook = async (_req, reply) => {
      reply.code(403).send({ error: 'Forbidden', message: 'role' });
    };
    const guarded = await buildApp({
      repo, store, fetcher,
      syncConfig: () => ({ botUrl: 'x' }),
      auth: { read: allow, readMedia: allow, write: deny, api: allow },
    });
    expect((await guarded.inject({ url: `${UI}/products` })).statusCode).toBe(200);
    expect((await guarded.inject({ method: 'PUT', url: `${UI}/products/${ASIN}`, payload: {} })).statusCode).toBe(403);
    expect((await guarded.inject({ method: 'POST', url: `${UI}/products/${ASIN}/listo` })).statusCode).toBe(403);
    expect((await guarded.inject({ method: 'DELETE', url: `${UI}/products/${ASIN}/media/1-a.jpg` })).statusCode).toBe(403);
    await guarded.close();
  });
});
