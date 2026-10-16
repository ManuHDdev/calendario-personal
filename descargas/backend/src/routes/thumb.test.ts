import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import Fastify, { FastifyInstance } from 'fastify';
import { mkdtempSync, mkdirSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

// Real RS256 JWTs signed with a throwaway key, verified by the real
// authMiddleware through a mocked JWKS client (same approach as descargas.test.ts).
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

let sandbox: string;
let root: string;
let cacheDir: string;
let app: FastifyInstance;
let symlinksSupported = true;
let bigJpegSize = 0;

const auth = (t: string) => ({ authorization: `Bearer ${t}` });
const thumb = (query: string, who: keyof typeof tokens = 'admin') =>
  app.inject({ url: `/descargas/api/thumb?${query}`, headers: auth(tokens[who]) });

/** Noisy RGB image so JPEG cannot compress it into nothing (like a real photo). */
function noisyImage(width: number, height: number) {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = Math.imul(i, 2654435761) >>> 24;
  return sharp(raw, { raw: { width, height, channels: 3 } });
}

function cachedFiles(dir: string): string[] {
  const out: string[] = [];
  for (const sub of readdirSync(dir)) {
    for (const f of readdirSync(path.join(dir, sub))) out.push(path.join(dir, sub, f));
  }
  return out;
}

beforeAll(async () => {
  sandbox = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'descargas-thumb-')));
  root = path.join(sandbox, 'root');
  cacheDir = path.join(sandbox, 'cache');
  mkdirSync(path.join(root, 'sub'), { recursive: true });

  // 2000x1000 landscape, EXIF orientation 6 (rotate 90 CW) => displayed 1000x2000.
  const big = await noisyImage(2000, 1000).jpeg({ quality: 92 }).withMetadata({ orientation: 6 }).toBuffer();
  bigJpegSize = big.length;
  writeFileSync(path.join(root, 'photo.jpg'), big);
  writeFileSync(path.join(root, 'sub', 'ñandú.jpg'), big);
  // Smaller than every whitelisted width.
  writeFileSync(path.join(root, 'tiny.png'), await noisyImage(50, 40).png().toBuffer());
  const solid = (size: number, background: string) => sharp({ create: { width: size, height: size, channels: 3, background } });
  writeFileSync(path.join(root, 'anim.gif'), await solid(30, '#f00').gif().toBuffer());
  writeFileSync(path.join(root, 'pic.avif'), await solid(64, '#0f0').avif().toBuffer());

  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
  writeFileSync(path.join(root, 'vector.svg'), svg);
  writeFileSync(path.join(root, 'disguised.jpg'), svg); // SVG content hiding behind a .jpg name
  writeFileSync(path.join(root, 'broken.jpg'), 'definitely not a jpeg');
  writeFileSync(path.join(root, 'notes.txt'), 'hola');
  writeFileSync(path.join(root, 'clip.mp4'), 'x'.repeat(100));

  await noisyImage(100, 100).jpeg().toFile(path.join(sandbox, 'secret.jpg'));
  try {
    symlinkSync(path.join(sandbox, 'secret.jpg'), path.join(root, 'leak.jpg'));
  } catch {
    symlinksSupported = false;
  }

  app = Fastify();
  await app.register(descargasRoutes, { prefix: '/descargas/api', root, thumbCacheDir: cacheDir });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  rmSync(sandbox, { recursive: true, force: true });
});

describe('GET /thumb auth', () => {
  it('401s without a token and with an expired one', async () => {
    expect((await app.inject({ url: '/descargas/api/thumb?path=photo.jpg' })).statusCode).toBe(401);
    expect((await thumb('path=photo.jpg', 'expired')).statusCode).toBe(401);
  });

  it.each(['familia', 'invitado'] as const)('403s %s', async (who) => {
    expect((await thumb('path=photo.jpg', who)).statusCode).toBe(403);
  });

  it.each(['admin', 'descargasAdmin', 'descargasInvitado'] as const)('allows %s', async (who) => {
    expect((await thumb('path=photo.jpg', who)).statusCode).toBe(200);
  });

  it('accepts ?token= (needed by <img>) and still enforces the role', async () => {
    const ok = await app.inject({ url: `/descargas/api/thumb?path=photo.jpg&token=${tokens.admin}` });
    expect(ok.statusCode).toBe(200);
    const no = await app.inject({ url: `/descargas/api/thumb?path=photo.jpg&token=${tokens.familia}` });
    expect(no.statusCode).toBe(403);
  });
});

describe('GET /thumb output', () => {
  it('returns a WebP far smaller than the original, no wider than the default 320', async () => {
    const res = await thumb('path=photo.jpg');
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('private, max-age=86400');
    expect(res.rawPayload.length).toBeLessThan(bigJpegSize / 5);
    const meta = await sharp(res.rawPayload).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBeLessThanOrEqual(320);
  });

  it('applies EXIF orientation: a 2000x1000 landscape tagged 6 comes out portrait 320x640', async () => {
    const meta = await sharp((await thumb('path=photo.jpg&w=320')).rawPayload).metadata();
    expect([meta.width, meta.height]).toEqual([320, 640]);
    expect(meta.orientation).toBeUndefined();
  });

  it.each([160, 320, 640])('honours whitelisted width %i', async (w) => {
    const meta = await sharp((await thumb(`path=photo.jpg&w=${w}`)).rawPayload).metadata();
    expect(meta.width).toBe(w);
  });

  it('never enlarges small images', async () => {
    const meta = await sharp((await thumb('path=tiny.png&w=640')).rawPayload).metadata();
    expect([meta.width, meta.height]).toEqual([50, 40]);
  });

  it('handles gif (first frame), avif and non-ASCII names', async () => {
    expect((await thumb('path=anim.gif')).statusCode).toBe(200);
    expect((await thumb('path=pic.avif')).statusCode).toBe(200);
    expect((await thumb(`path=${encodeURIComponent('sub/ñandú.jpg')}`)).statusCode).toBe(200);
  });
});

describe('GET /thumb validation', () => {
  it.each(['100', '321', '0', '-320', '1280', '320.5', 'abc', '99999999'])('rejects width %s with 400', async (w) => {
    expect((await thumb(`path=photo.jpg&w=${w}`)).statusCode).toBe(400);
  });

  it('rejects a repeated w parameter', async () => {
    expect((await thumb('path=photo.jpg&w=160&w=640')).statusCode).toBe(400);
  });

  it('415s non-images, videos and SVG (never rasterised)', async () => {
    for (const p of ['notes.txt', 'clip.mp4', 'vector.svg']) {
      expect((await thumb(`path=${p}`)).statusCode, p).toBe(415);
    }
  });

  it('415s an SVG disguised with an image extension, and corrupt images', async () => {
    expect((await thumb('path=disguised.jpg')).statusCode).toBe(415);
    expect((await thumb('path=broken.jpg')).statusCode).toBe(415);
  });

  it('does not attach cache headers to error responses', async () => {
    const res = await thumb('path=broken.jpg');
    expect(res.headers.etag).toBeUndefined();
    expect(res.headers['cache-control']).toBeUndefined();
  });

  it('400s on directories and 404s on missing files', async () => {
    expect((await thumb('path=sub')).statusCode).toBe(400);
    expect((await thumb('path=nope.jpg')).statusCode).toBe(404);
  });

  it.each(['../secret.jpg', '..%2Fsecret.jpg', '/etc/passwd', 'sub/../../secret.jpg', 'a%00.jpg', 'C:/x.jpg'])(
    'rejects traversal/absolute path %s',
    async (p) => {
      const res = await thumb(`path=${p}`);
      expect([400, 404], p).toContain(res.statusCode);
    },
  );

  it('does not thumbnail a symlink pointing outside the root', async (ctx) => {
    if (!symlinksSupported) return ctx.skip();
    expect((await thumb('path=leak.jpg')).statusCode).toBe(404);
  });
});

describe('GET /thumb caching', () => {
  it('writes to the cache dir, then serves the cached bytes on the next request', async () => {
    const first = await thumb('path=photo.jpg&w=160');
    expect(first.statusCode).toBe(200);
    const etag = (first.headers.etag as string).slice(1, -1);
    const file = cachedFiles(cacheDir).find((f) => f.includes(etag));
    expect(file).toBeDefined();
    expect(readdirSync(path.dirname(file!)).some((f) => f.endsWith('.tmp'))).toBe(false);

    // Tamper with the cached entry: a hit must return it untouched (no regeneration).
    const marker = Buffer.from('FROM-CACHE');
    writeFileSync(file!, marker);
    const second = await thumb('path=photo.jpg&w=160');
    expect(second.rawPayload.equals(marker)).toBe(true);
  });

  it('shares one generation between concurrent identical requests', async () => {
    const before = cachedFiles(cacheDir).length;
    const results = await Promise.all(
      Array.from({ length: 6 }, () => thumb(`path=${encodeURIComponent('sub/ñandú.jpg')}&w=640`)),
    );
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    expect(new Set(results.map((r) => r.rawPayload.length)).size).toBe(1);
    expect(cachedFiles(cacheDir).length).toBe(before + 1);
  });

  it('answers 304 to If-None-Match', async () => {
    const first = await thumb('path=tiny.png&w=160');
    const etag = first.headers.etag as string;
    expect(etag).toMatch(/^"[0-9a-f]{40}"$/);
    const again = await app.inject({
      url: '/descargas/api/thumb?path=tiny.png&w=160',
      headers: { ...auth(tokens.admin), 'if-none-match': etag },
    });
    expect(again.statusCode).toBe(304);
    expect(again.rawPayload.length).toBe(0);
    expect(again.headers.etag).toBe(etag);
  });

  it('still requires auth for a 304 (an ETag alone gives no access)', async () => {
    const etag = (await thumb('path=tiny.png&w=160')).headers.etag as string;
    const res = await app.inject({ url: '/descargas/api/thumb?path=tiny.png&w=160', headers: { 'if-none-match': etag } });
    expect(res.statusCode).toBe(401);
  });

  it('changes the ETag when the width differs', async () => {
    const a = (await thumb('path=photo.jpg&w=160')).headers.etag;
    const b = (await thumb('path=photo.jpg&w=640')).headers.etag;
    expect(a).not.toBe(b);
  });

  it('still serves thumbnails when the cache dir is not writable', async () => {
    const blocked = path.join(sandbox, 'blocked');
    writeFileSync(blocked, 'a file, so mkdir under it fails');
    const other = Fastify();
    await other.register(descargasRoutes, { prefix: '/descargas/api', root, thumbCacheDir: path.join(blocked, 'x') });
    const res = await other.inject({ url: '/descargas/api/thumb?path=photo.jpg', headers: auth(tokens.admin) });
    expect(res.statusCode).toBe(200);
    expect((await sharp(res.rawPayload).metadata()).format).toBe('webp');
    await other.close();
  });
});
