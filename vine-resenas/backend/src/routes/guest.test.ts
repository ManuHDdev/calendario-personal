import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { apiTokenMiddleware } from '../middleware/bearerAuth';
import { MAX_GUEST_FILES, hashToken } from '../services/guestLinkService';
import { FakeRepo, FakeStore } from '../testing/fakes';
import type { Hook } from './deps';
import type { GuestRateLimits } from './guest';

const ASIN = 'B0FQBYHJ17';
const UI = '/vine-resenas/api/ui';
const GUEST = '/vine-resenas/api/guest';
const V1 = '/vine-resenas/api/v1';
const API_TOKEN = 'tok-0123456789abcdef0123';

let app: FastifyInstance;
let repo: FakeRepo;
let store: FakeStore;

// Models Keycloak: x-role picks the caller's role; none -> 401; invitado cannot write.
const roleHook =
  (allowed: string[]): Hook =>
  async (request, reply) => {
    const role = request.headers['x-role'] as string | undefined;
    if (!role) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    if (!allowed.includes(role)) reply.code(403).send({ error: 'Forbidden' });
  };
const admin = { 'x-role': 'admin' };
const invitado = { 'x-role': 'invitado' };

async function build(guestLimits?: GuestRateLimits) {
  repo = new FakeRepo();
  repo.seed({ asin: ASIN, titulo: 'Brochetas', feedback: 'privado', estrellas: 5, resena_resumida: 'SECRETO' });
  store = new FakeStore();
  app = await buildApp(
    {
      repo,
      store,
      fetcher: async () => [],
      syncConfig: () => ({ botUrl: 'http://bot' }),
      auth: {
        read: roleHook(['admin', 'vine_admin', 'invitado']),
        readMedia: roleHook(['admin', 'vine_admin', 'invitado']),
        write: roleHook(['admin', 'vine_admin']),
        api: apiTokenMiddleware(() => API_TOKEN),
      },
    },
    { guestLimits },
  );
}

beforeEach(async () => {
  await build();
});
afterEach(() => app.close());

function multipart(files: { name: string; type: string; data: string }[]) {
  const boundary = '----guesttest';
  const parts = files.map(
    (f) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${f.name}"\r\nContent-Type: ${f.type}\r\n\r\n${f.data}\r\n`,
  );
  return {
    payload: parts.join('') + `--${boundary}--\r\n`,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

async function newLink(body: object = {}) {
  const res = await app.inject({ method: 'POST', url: `${UI}/products/${ASIN}/guest-links`, headers: admin, payload: body });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: number; url: string; token: string; expiresAt: string };
}

const upload = (token: string, files: { name: string; type: string; data: string }[]) =>
  app.inject({ method: 'POST', url: `${GUEST}/${token}/media`, ...multipart(files) });

describe('owner endpoints: authorization', () => {
  it('401 without auth, 403 for vine_invitado, ok for admin', async () => {
    const calls = [
      { method: 'POST', url: `${UI}/products/${ASIN}/guest-links` },
      { method: 'GET', url: `${UI}/products/${ASIN}/guest-links` },
      { method: 'DELETE', url: `${UI}/guest-links/1` },
    ] as const;
    for (const c of calls) {
      expect((await app.inject(c)).statusCode).toBe(401);
      expect((await app.inject({ ...c, headers: invitado })).statusCode).toBe(403);
    }
    expect(repo.links).toHaveLength(0);
    expect((await app.inject({ method: 'GET', url: calls[1].url, headers: admin })).statusCode).toBe(200);
  });
});

describe('owner endpoints: create / list / revoke', () => {
  it('creates a link: token shown once, default 14 days, url path, only the hash stored', async () => {
    const r = await newLink();
    expect(r.url).toBe(`/vine-resenas/c/${r.token}`);
    expect(r.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const days = (new Date(r.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
    expect(repo.links[0].token_hash).toBe(hashToken(r.token));
  });

  it('validates expiresInDays (1..60)', async () => {
    for (const bad of [0, 61, 1.5, 'x']) {
      const res = await app.inject({
        method: 'POST',
        url: `${UI}/products/${ASIN}/guest-links`,
        headers: admin,
        payload: { expiresInDays: bad },
      });
      expect(res.statusCode).toBe(400);
    }
    expect((await newLink({ expiresInDays: 60 })).id).toBeGreaterThan(0);
  });

  it('lists links with status and never the token or its hash', async () => {
    const a = await newLink();
    const b = await newLink();
    await app.inject({ method: 'DELETE', url: `${UI}/guest-links/${a.id}`, headers: admin });
    const res = await app.inject({ method: 'GET', url: `${UI}/products/${ASIN}/guest-links`, headers: admin });
    const list = res.json() as { id: number; status: string }[];
    expect(list.map((l) => [l.id, l.status])).toEqual([
      [b.id, 'active'],
      [a.id, 'revoked'],
    ]);
    expect(res.body).not.toContain(a.token);
    expect(res.body).not.toContain(b.token);
    expect(res.body).not.toContain(hashToken(a.token));
    expect(Object.keys(list[0]).sort()).toEqual(['createdAt', 'expiresAt', 'id', 'lastUsedAt', 'revokedAt', 'status']);
  });

  it('revoke is idempotent, 404 for unknown id, 400 for junk', async () => {
    const a = await newLink();
    expect((await app.inject({ method: 'DELETE', url: `${UI}/guest-links/${a.id}`, headers: admin })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `${UI}/guest-links/${a.id}`, headers: admin })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `${UI}/guest-links/999`, headers: admin })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `${UI}/guest-links/abc`, headers: admin })).statusCode).toBe(400);
  });

  it('refuses to create a link for a published product', async () => {
    repo.products.get(ASIN)!.estado = 'publicado';
    const res = await app.inject({ method: 'POST', url: `${UI}/products/${ASIN}/guest-links`, headers: admin, payload: {} });
    expect(res.statusCode).toBe(409);
  });
});

describe('public guest endpoints', () => {
  it('needs no auth and exposes only title, cover, own feedback, own media', async () => {
    await repo.addMedia({ asin: ASIN, filename: '1-owner.jpg', type: 'photo', size: 1 });
    const { token } = await newLink();
    const res = await app.inject({ url: `${GUEST}/${token}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.titulo).toBe('Brochetas');
    expect(body.thumbnail_url).toBe(`${GUEST}/${token}/media/1-owner.jpg`);
    expect(body.media).toEqual([]);
    expect(body.limits).toEqual({ maxFiles: MAX_GUEST_FILES, used: 0 });
    for (const secret of ['privado', 'SECRETO', 'estrellas', 'estado', ASIN]) {
      expect(res.body).not.toContain(secret);
    }
    expect(res.headers['cache-control']).toBe('no-store');
    expect(repo.links[0].last_used_at).not.toBeNull();
  });

  it('answers unknown, expired, revoked and malformed tokens with the identical 404', async () => {
    const revoked = await newLink();
    await app.inject({ method: 'DELETE', url: `${UI}/guest-links/${revoked.id}`, headers: admin });
    const expired = await newLink();
    repo.links.find((l) => l.id === expired.id)!.expires_at = new Date(Date.now() - 1000).toISOString();
    const bodies = new Set<string>();
    for (const t of [revoked.token, expired.token, 'A'.repeat(43), 'nope']) {
      const res = await app.inject({ url: `${GUEST}/${t}` });
      expect(res.statusCode).toBe(404);
      bodies.add(res.body);
    }
    expect(bodies.size).toBe(1);
    const put = await app.inject({ method: 'PUT', url: `${GUEST}/${revoked.token}/feedback`, payload: { feedback: 'x' } });
    expect(put.statusCode).toBe(404);
    expect((await upload(expired.token, [{ name: 'a.jpg', type: 'image/jpeg', data: 'x' }])).statusCode).toBe(404);
    expect(repo.media).toHaveLength(0);
  });

  it('rejects a published product with 410', async () => {
    const { token } = await newLink();
    repo.products.get(ASIN)!.estado = 'publicado';
    expect((await app.inject({ url: `${GUEST}/${token}` })).statusCode).toBe(410);
    const put = await app.inject({ method: 'PUT', url: `${GUEST}/${token}/feedback`, payload: { feedback: 'x' } });
    expect(put.statusCode).toBe(410);
  });

  it('PUT feedback writes guest_feedback only, never the owner feedback', async () => {
    const { token } = await newLink();
    const res = await app.inject({ method: 'PUT', url: `${GUEST}/${token}/feedback`, payload: { feedback: 'Muy rico' } });
    expect(res.statusCode).toBe(200);
    const p = repo.products.get(ASIN)!;
    expect(p.guest_feedback).toBe('Muy rico');
    expect(p.feedback).toBe('privado');
    expect((await app.inject({ url: `${GUEST}/${token}` })).json().feedback).toBe('Muy rico');
    const tooLong = await app.inject({
      method: 'PUT',
      url: `${GUEST}/${token}/feedback`,
      payload: { feedback: 'x'.repeat(5001) },
    });
    expect(tooLong.statusCode).toBe(400);
  });

  it('uploads media through the shared validation, marked as guest media', async () => {
    const { token } = await newLink();
    const ok = await upload(token, [{ name: '../../x.JPG', type: 'image/jpeg', data: 'abc' }]);
    expect(ok.statusCode).toBe(201);
    const up = ok.json().uploaded[0];
    expect(up.filename).toMatch(/^\d+-[0-9a-f]+\.jpg$/);
    expect(Object.keys(up).sort()).toEqual(['filename', 'size', 'type', 'url']);
    expect(repo.media[0].uploaded_via_guest_link_id).toBe(repo.links[0].id);

    expect((await upload(token, [{ name: 'a.exe', type: 'application/octet-stream', data: 'x' }])).statusCode).toBe(415);
    expect((await upload(token, [{ name: 'a.jpg', type: 'video/mp4', data: 'x' }])).statusCode).toBe(415);
    expect(repo.media).toHaveLength(1);

    const view = (await app.inject({ url: `${GUEST}/${token}` })).json();
    expect(view.media).toHaveLength(1);
    expect(view.limits.used).toBe(1);
    const file = await app.inject({ url: up.url });
    expect(file.statusCode).toBe(200);
    expect(file.body).toBe('abc');
  });

  it('caps total uploads per link', async () => {
    const { token } = await newLink();
    const link = repo.links[0];
    for (let i = 0; i < MAX_GUEST_FILES - 1; i++) {
      await repo.addMedia({ asin: ASIN, filename: `1-g${i}.jpg`, type: 'photo', size: 1, guestLinkId: link.id });
    }
    const two = await upload(token, [
      { name: 'a.jpg', type: 'image/jpeg', data: 'a' },
      { name: 'b.jpg', type: 'image/jpeg', data: 'b' },
    ]);
    expect(two.statusCode).toBe(201);
    expect(two.json().uploaded).toHaveLength(1);
    expect(two.json().rejected[0].error).toBe('UploadLimitReached');
    expect((await upload(token, [{ name: 'c.jpg', type: 'image/jpeg', data: 'c' }])).statusCode).toBe(409);
    expect(await repo.countGuestMedia(link.id)).toBe(MAX_GUEST_FILES);
  });

  it('a guest cannot replace the owner video', async () => {
    await repo.addMedia({ asin: ASIN, filename: '1-owner.mp4', type: 'video', size: 1 });
    store.files.set(`${ASIN}/1-owner.mp4`, Buffer.from('v'));
    const { token } = await newLink();
    const res = await upload(token, [{ name: 'v.mp4', type: 'video/mp4', data: 'new' }]);
    expect(res.statusCode).toBe(409);
    expect(repo.media.map((m) => m.filename)).toEqual(['1-owner.mp4']);
    expect(store.files.size).toBe(1);
  });

  it('a guest can replace its own video', async () => {
    const { token } = await newLink();
    for (const d of ['one', 'two']) {
      expect((await upload(token, [{ name: 'v.mp4', type: 'video/mp4', data: d }])).statusCode).toBe(201);
    }
    expect(repo.media.filter((m) => m.type === 'video')).toHaveLength(1);
  });

  it('deletes only media uploaded through that same link', async () => {
    await repo.addMedia({ asin: ASIN, filename: '1-owner.jpg', type: 'photo', size: 1 });
    const a = await newLink();
    const b = await newLink();
    const up = await upload(a.token, [{ name: 'a.jpg', type: 'image/jpeg', data: 'a' }]);
    const mine = up.json().uploaded[0].filename as string;

    const attempts: [string, string][] = [
      [a.token, '1-owner.jpg'],
      [b.token, mine],
      [a.token, '9-zzzz.jpg'],
    ];
    for (const [t, f] of attempts) {
      expect((await app.inject({ method: 'DELETE', url: `${GUEST}/${t}/media/${f}` })).statusCode).toBe(404);
    }
    expect((await app.inject({ method: 'DELETE', url: `${GUEST}/${a.token}/media/..%2F..%2Fx.jpg` })).statusCode).toBe(400);
    expect(repo.media).toHaveLength(2);
    expect((await app.inject({ method: 'DELETE', url: `${GUEST}/${a.token}/media/${mine}` })).statusCode).toBe(204);
    expect(repo.media.map((m) => m.filename)).toEqual(['1-owner.jpg']);
  });

  it('serves only own uploads and the cover photo, not other owner media', async () => {
    await repo.addMedia({ asin: ASIN, filename: '1-cover.jpg', type: 'photo', size: 1 });
    await repo.addMedia({ asin: ASIN, filename: '2-second.jpg', type: 'photo', size: 1 });
    store.files.set(`${ASIN}/1-cover.jpg`, Buffer.from('c'));
    store.files.set(`${ASIN}/2-second.jpg`, Buffer.from('s'));
    const { token } = await newLink();
    expect((await app.inject({ url: `${GUEST}/${token}/media/1-cover.jpg` })).statusCode).toBe(200);
    expect((await app.inject({ url: `${GUEST}/${token}/media/2-second.jpg` })).statusCode).toBe(404);
  });

  it('an owner-side revoke immediately cuts access', async () => {
    const { id, token } = await newLink();
    await app.inject({ method: 'DELETE', url: `${UI}/guest-links/${id}`, headers: admin });
    expect((await app.inject({ url: `${GUEST}/${token}` })).statusCode).toBe(404);
  });
});

describe('owner view of guest data', () => {
  it('marks guest media and exposes guest_feedback in UI and v1', async () => {
    const { token } = await newLink();
    await upload(token, [{ name: 'a.jpg', type: 'image/jpeg', data: 'a' }]);
    await app.inject({ method: 'PUT', url: `${GUEST}/${token}/feedback`, payload: { feedback: 'Opinion de la tia' } });
    const ui = (await app.inject({ url: `${UI}/products/${ASIN}`, headers: admin })).json();
    expect(ui.guest_feedback).toBe('Opinion de la tia');
    expect(ui.media[0].uploaded_by_guest).toBe(true);
    const v1 = (await app.inject({ url: `${V1}/products/${ASIN}`, headers: { authorization: `Bearer ${API_TOKEN}` } })).json();
    expect(v1.guest_feedback).toBe('Opinion de la tia');
  });

  it('owner PUT cannot overwrite guest_feedback', async () => {
    repo.products.get(ASIN)!.guest_feedback = 'g';
    await app.inject({
      method: 'PUT',
      url: `${UI}/products/${ASIN}`,
      headers: admin,
      payload: { guest_feedback: 'hack', feedback: 'mio' },
    });
    expect(repo.products.get(ASIN)!.guest_feedback).toBe('g');
    expect(repo.products.get(ASIN)!.feedback).toBe('mio');
  });
});

describe('rate limiting', () => {
  it('limits requests per IP on /guest routes with 429 + Retry-After', async () => {
    await app.close();
    await build({ max: 3, windowMs: 60_000, maxFailures: 100, failureWindowMs: 60_000 });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await app.inject({ url: `${GUEST}/${'A'.repeat(43)}` })).statusCode);
    expect(codes).toEqual([404, 404, 404, 429, 429]);
    const blocked = await app.inject({ url: `${GUEST}/${'A'.repeat(43)}` });
    expect(blocked.headers['retry-after']).toBeDefined();
    expect((await app.inject({ url: '/vine-resenas/api/health' })).statusCode).toBe(200);
  });

  it('blocks an IP after too many invalid-token lookups, even for a valid token', async () => {
    await app.close();
    await build({ max: 1000, windowMs: 60_000, maxFailures: 3, failureWindowMs: 60_000 });
    const { token } = await newLink();
    for (let i = 0; i < 3; i++) {
      expect((await app.inject({ url: `${GUEST}/${'B'.repeat(43)}` })).statusCode).toBe(404);
    }
    expect((await app.inject({ url: `${GUEST}/${token}` })).statusCode).toBe(429);
  });
});
