import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

// Real RS256 JWTs signed with a throwaway key, verified by the real
// authMiddleware through a mocked JWKS client (same approach as mensajeria/ofertas).
const { tokens, publicKeyPem } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { generateKeyPairSync, sign } = require('crypto') as typeof import('crypto');
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const b64 = (v: Buffer | string) => Buffer.from(v).toString('base64url');
  const signJwt = (payload: Record<string, unknown>) => {
    const head = b64(JSON.stringify({ alg: 'RS256', kid: 'test-kid', typ: 'JWT' }));
    const body = b64(JSON.stringify(payload));
    return `${head}.${body}.${b64(sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey))}`;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const withRoles = (roles: string[]) => signJwt({ realm_access: { roles }, exp });
  return {
    publicKeyPem: pem,
    tokens: {
      admin: withRoles(['admin']),
      descargasAdmin: withRoles(['descargas_admin']),
      descargasInvitado: withRoles(['descargas_invitado']),
      familia: withRoles(['familia']),
      invitado: withRoles(['invitado']),
      expired: signJwt({ realm_access: { roles: ['admin'] }, exp: Math.floor(Date.now() / 1000) - 10 }),
    },
  };
});

vi.mock('jwks-rsa', () => ({
  default: vi.fn(() => ({
    getSigningKey: vi.fn(async () => ({ getPublicKey: () => publicKeyPem })),
  })),
}));

import { descargasRoutes } from './descargas';

const CONTENT = '0123456789'.repeat(10); // 100 bytes
let sandbox: string;
let root: string;
let app: FastifyInstance;
let symlinksSupported = true;

const auth = (t: string) => ({ authorization: `Bearer ${t}` });

beforeAll(async () => {
  sandbox = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'descargas-routes-')));
  root = path.join(sandbox, 'root');
  mkdirSync(path.join(root, 'sub'), { recursive: true });
  writeFileSync(path.join(root, 'clip.mp4'), CONTENT);
  writeFileSync(path.join(root, 'photo.jpg'), 'jpgdata');
  writeFileSync(path.join(root, 'sub', 'ñandú café.txt'), 'hola');
  writeFileSync(path.join(root, 'page.html'), '<script>alert(1)</script>');
  writeFileSync(path.join(root, 'empty.bin'), '');
  writeFileSync(path.join(sandbox, 'secret.txt'), 'top secret');
  try {
    symlinkSync(path.join(sandbox, 'secret.txt'), path.join(root, 'leak.txt'));
  } catch {
    symlinksSupported = false;
  }

  app = Fastify();
  await app.register(descargasRoutes, { prefix: '/descargas/api', root });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  rmSync(sandbox, { recursive: true, force: true });
});

describe('role gating', () => {
  it.each(['/descargas/api/list', '/descargas/api/file?path=photo.jpg', '/descargas/api/download?path=photo.jpg'])(
    '%s returns 401 without a token',
    async (url) => {
      expect((await app.inject({ url })).statusCode).toBe(401);
    },
  );

  it('rejects expired tokens and garbage with 401', async () => {
    expect((await app.inject({ url: '/descargas/api/list', headers: auth(tokens.expired) })).statusCode).toBe(401);
    expect((await app.inject({ url: '/descargas/api/list', headers: auth('not.a.jwt') })).statusCode).toBe(401);
  });

  it.each(['admin', 'descargasAdmin', 'descargasInvitado'] as const)('allows %s on every route', async (who) => {
    for (const url of ['/descargas/api/list', '/descargas/api/file?path=photo.jpg', '/descargas/api/download?path=photo.jpg']) {
      const res = await app.inject({ url, headers: auth(tokens[who]) });
      expect(res.statusCode, `${who} ${url}`).toBe(200);
    }
  });

  it.each(['familia', 'invitado'] as const)('forbids %s (private files) with 403 on every route', async (who) => {
    for (const url of ['/descargas/api/list', '/descargas/api/file?path=photo.jpg', '/descargas/api/download?path=photo.jpg']) {
      const res = await app.inject({ url, headers: auth(tokens[who]) });
      expect(res.statusCode, `${who} ${url}`).toBe(403);
    }
  });

  it('accepts ?token= only on the byte-serving routes, never on /list', async () => {
    const file = await app.inject({ url: `/descargas/api/file?path=photo.jpg&token=${tokens.admin}` });
    expect(file.statusCode).toBe(200);
    const dl = await app.inject({ url: `/descargas/api/download?path=photo.jpg&token=${tokens.admin}` });
    expect(dl.statusCode).toBe(200);
    const list = await app.inject({ url: `/descargas/api/list?token=${tokens.admin}` });
    expect(list.statusCode).toBe(401);
  });

  it('still enforces the role when the token comes in the query string', async () => {
    const res = await app.inject({ url: `/descargas/api/file?path=photo.jpg&token=${tokens.familia}` });
    expect(res.statusCode).toBe(403);
  });

  it('exposes no write endpoints', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      for (const url of ['/descargas/api/list', '/descargas/api/file?path=photo.jpg', '/descargas/api/upload']) {
        const res = await app.inject({ method, url, headers: auth(tokens.admin) });
        expect(res.statusCode, `${method} ${url}`).toBe(404);
      }
    }
  });
});

describe('GET /list', () => {
  it('lists the root', async () => {
    const res = await app.inject({ url: '/descargas/api/list', headers: auth(tokens.admin) });
    const body = res.json();
    expect(body.path).toBe('');
    expect(body.entries[0]).toMatchObject({ name: 'sub', type: 'dir' });
    expect(body.entries.map((e: { name: string }) => e.name)).toEqual(
      expect.arrayContaining(['clip.mp4', 'photo.jpg', 'page.html']),
    );
  });

  it('lists a subfolder and 400s on a file', async () => {
    const sub = await app.inject({ url: '/descargas/api/list?path=sub', headers: auth(tokens.admin) });
    expect(sub.json().entries[0]).toMatchObject({ name: 'ñandú café.txt', path: 'sub/ñandú café.txt', category: 'text' });
    const file = await app.inject({ url: '/descargas/api/list?path=photo.jpg', headers: auth(tokens.admin) });
    expect(file.statusCode).toBe(400);
  });
});

describe('path traversal', () => {
  const attempts: Array<[string, string, number]> = [
    ['dot-dot', '..', 400],
    ['dot-dot nested', 'sub/../..', 400],
    ['encoded dot-dot (%2e%2e)', '%2e%2e%2fsecret.txt', 400],
    ['encoded slash (..%2f)', '..%2fsecret.txt', 400],
    ['absolute posix', '%2Fetc%2Fpasswd', 400],
    ['windows drive', 'C%3A%5CWindows', 400],
    ['backslash traversal', '..%5Csecret.txt', 400],
    ['null byte', 'photo.jpg%00.txt', 400],
    ['double encoded stays a literal name', '%252e%252e%252fsecret.txt', 404],
  ];

  for (const route of ['list', 'file', 'download']) {
    it.each(attempts)(`${route}: %s`, async (_label, qs, expected) => {
      const res = await app.inject({ url: `/descargas/api/${route}?path=${qs}`, headers: auth(tokens.admin) });
      expect(res.statusCode).toBe(expected);
      expect(res.body).not.toContain('top secret');
    });
  }

  it('does not serve a symlink pointing outside the root', async (ctx) => {
    if (!symlinksSupported) return ctx.skip();
    for (const route of ['file', 'download']) {
      const res = await app.inject({ url: `/descargas/api/${route}?path=leak.txt`, headers: auth(tokens.admin) });
      expect(res.statusCode).toBe(404);
      expect(res.body).not.toContain('top secret');
    }
    const list = await app.inject({ url: '/descargas/api/list', headers: auth(tokens.admin) });
    expect(list.json().entries.map((e: { name: string }) => e.name)).not.toContain('leak.txt');
  });
});

describe('GET /file', () => {
  it('serves the whole file with type, length and range support advertised', async () => {
    const res = await app.inject({ url: '/descargas/api/file?path=clip.mp4', headers: auth(tokens.admin) });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('video/mp4');
    expect(res.headers['content-length']).toBe('100');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-disposition']).toMatch(/^inline;/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body).toBe(CONTENT);
  });

  it('answers a bounded range with 206 and the exact bytes', async () => {
    const res = await app.inject({
      url: '/descargas/api/file?path=clip.mp4',
      headers: { ...auth(tokens.admin), range: 'bytes=10-19' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 10-19/100');
    expect(res.headers['content-length']).toBe('10');
    expect(res.body).toBe(CONTENT.slice(10, 20));
  });

  it('supports open-ended and suffix ranges (video seeking)', async () => {
    const open = await app.inject({
      url: '/descargas/api/file?path=clip.mp4',
      headers: { ...auth(tokens.admin), range: 'bytes=90-' },
    });
    expect(open.statusCode).toBe(206);
    expect(open.headers['content-range']).toBe('bytes 90-99/100');
    const suffix = await app.inject({
      url: '/descargas/api/file?path=clip.mp4',
      headers: { ...auth(tokens.admin), range: 'bytes=-5' },
    });
    expect(suffix.headers['content-range']).toBe('bytes 95-99/100');
    expect(suffix.body).toBe(CONTENT.slice(95));
  });

  it('answers an unsatisfiable range with 416 and Content-Range */size', async () => {
    for (const range of ['bytes=100-', 'bytes=500-600', 'bytes=20-10', 'bytes=abc']) {
      const res = await app.inject({
        url: '/descargas/api/file?path=clip.mp4',
        headers: { ...auth(tokens.admin), range },
      });
      expect(res.statusCode, range).toBe(416);
      expect(res.headers['content-range'], range).toBe('bytes */100');
      expect(res.headers['content-type']).toMatch(/application\/json/);
    }
  });

  it('416s any range on an empty file', async () => {
    const res = await app.inject({
      url: '/descargas/api/file?path=empty.bin',
      headers: { ...auth(tokens.admin), range: 'bytes=0-0' },
    });
    expect(res.statusCode).toBe(416);
    expect(res.headers['content-range']).toBe('bytes */0');
  });

  it('works with the token in the query string and a Range header (media elements)', async () => {
    const res = await app.inject({
      url: `/descargas/api/file?path=clip.mp4&token=${tokens.descargasInvitado}`,
      headers: { range: 'bytes=0-4' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.body).toBe('01234');
  });

  it('never renders active content inline', async () => {
    const res = await app.inject({ url: '/descargas/api/file?path=page.html', headers: auth(tokens.admin) });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['content-disposition']).toMatch(/^attachment;/);
  });

  it('sandboxes non-PDF responses with a CSP', async () => {
    const res = await app.inject({ url: '/descargas/api/file?path=photo.jpg', headers: auth(tokens.admin) });
    expect(res.headers['content-security-policy']).toContain('sandbox');
  });

  it('400s on a directory and 404s on a missing file', async () => {
    expect((await app.inject({ url: '/descargas/api/file?path=sub', headers: auth(tokens.admin) })).statusCode).toBe(400);
    expect((await app.inject({ url: '/descargas/api/file?path=nope.jpg', headers: auth(tokens.admin) })).statusCode).toBe(404);
  });
});

describe('GET /download', () => {
  it('sends an attachment with an RFC 5987 filename for non-ASCII names', async () => {
    const res = await app.inject({
      url: '/descargas/api/download?path=sub%2F%C3%B1and%C3%BA%20caf%C3%A9.txt',
      headers: auth(tokens.admin),
    });
    expect(res.statusCode).toBe(200);
    const cd = String(res.headers['content-disposition']);
    expect(cd).toMatch(/^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
    expect(cd).toContain(encodeURIComponent('ñandú café.txt'));
    expect(res.body).toBe('hola');
  });

  it('also honours Range', async () => {
    const res = await app.inject({
      url: '/descargas/api/download?path=clip.mp4',
      headers: { ...auth(tokens.admin), range: 'bytes=0-9' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-disposition']).toMatch(/^attachment;/);
  });
});
