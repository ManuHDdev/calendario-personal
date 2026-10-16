import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

// Same real-JWT + mocked-JWKS approach as descargas.test.ts.
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
  const withRoles = (roles: string[]) => signJwt({ preferred_username: 'tester', realm_access: { roles }, exp });
  return {
    publicKeyPem: pem,
    tokens: {
      admin: withRoles(['admin']),
      descargasAdmin: withRoles(['descargas_admin']),
      descargasInvitado: withRoles(['descargas_invitado']),
      familia: withRoles(['familia']),
      invitado: withRoles(['invitado']),
    },
  };
});

vi.mock('jwks-rsa', () => ({
  default: vi.fn(() => ({
    getSigningKey: vi.fn(async () => ({ getPublicKey: () => publicKeyPem })),
  })),
}));

import { descargasRoutes } from './descargas';
import { MAX_DELETE_PATHS } from '../services/deletion';

const URL = '/descargas/api/delete';
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

let sandbox: string;
let root: string;
let outside: string;
let app: FastifyInstance;

async function post(body: unknown, token: string | null = tokens.admin, url = URL) {
  return app.inject({
    method: 'POST',
    url,
    headers: token ? auth(token) : {},
    payload: body as Record<string, unknown>,
  });
}

beforeAll(() => {
  sandbox = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'descargas-delete-')));
});

beforeEach(async () => {
  // Fresh tree per test: deletion is destructive.
  root = path.join(sandbox, 'root');
  outside = path.join(sandbox, 'outside');
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
  mkdirSync(path.join(root, 'folder', 'nested'), { recursive: true });
  mkdirSync(path.join(root, 'keep'), { recursive: true });
  mkdirSync(path.join(outside, 'dir'), { recursive: true });
  writeFileSync(path.join(root, 'a.txt'), 'a');
  writeFileSync(path.join(root, 'b.txt'), 'b');
  writeFileSync(path.join(root, 'keep', 'k.txt'), 'k');
  writeFileSync(path.join(root, 'folder', 'f1.txt'), 'f1');
  writeFileSync(path.join(root, 'folder', 'nested', 'f2.txt'), 'f2');
  writeFileSync(path.join(root, 'ñandú café.txt'), 'x');
  writeFileSync(path.join(outside, 'secret.txt'), 'top secret');
  writeFileSync(path.join(outside, 'dir', 'inner.txt'), 'inner');

  app = Fastify();
  await app.register(descargasRoutes, { prefix: '/descargas/api', root, thumbCacheDir: path.join(sandbox, 'cache') });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

/** Symlinks need privileges on Windows: those tests are skipped there when unavailable. */
function trySymlink(target: string, link: string): boolean {
  try {
    symlinkSync(target, link);
    return true;
  } catch {
    return false;
  }
}

describe('POST /delete role gating', () => {
  it('returns 401 without a token and removes nothing', async () => {
    const res = await post({ paths: ['a.txt'] }, null);
    expect(res.statusCode).toBe(401);
    expect(existsSync(path.join(root, 'a.txt'))).toBe(true);
  });

  it('returns 401 for a garbage token', async () => {
    expect((await post({ paths: ['a.txt'] }, 'not.a.jwt')).statusCode).toBe(401);
  });

  it.each(['admin', 'descargasAdmin'] as const)('allows %s', async (who) => {
    const res = await post({ paths: ['a.txt'] }, tokens[who]);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ deleted: ['a.txt'], failed: [] });
    expect(existsSync(path.join(root, 'a.txt'))).toBe(false);
  });

  it.each(['descargasInvitado', 'familia', 'invitado'] as const)('forbids %s with 403 and removes nothing', async (who) => {
    const res = await post({ paths: ['a.txt'] }, tokens[who]);
    expect(res.statusCode).toBe(403);
    expect(existsSync(path.join(root, 'a.txt'))).toBe(true);
  });

  it('never accepts the token from the query string', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${URL}?token=${tokens.admin}`,
      payload: { paths: ['a.txt'] },
    });
    expect(res.statusCode).toBe(401);
    expect(existsSync(path.join(root, 'a.txt'))).toBe(true);
  });
});

describe('POST /delete behaviour', () => {
  it('really removes files from the root, including non-ASCII names', async () => {
    const res = await post({ paths: ['a.txt', 'ñandú café.txt'] });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ deleted: ['a.txt', 'ñandú café.txt'], failed: [] });
    expect(existsSync(path.join(root, 'a.txt'))).toBe(false);
    expect(existsSync(path.join(root, 'ñandú café.txt'))).toBe(false);
    expect(existsSync(path.join(root, 'b.txt'))).toBe(true);
  });

  it('removes a folder recursively', async () => {
    const res = await post({ paths: ['folder'] });
    expect(res.json()).toEqual({ deleted: ['folder'], failed: [] });
    expect(existsSync(path.join(root, 'folder'))).toBe(false);
    expect(existsSync(path.join(root, 'keep', 'k.txt'))).toBe(true);
  });

  it('normalises paths and collapses duplicates', async () => {
    const res = await post({ paths: ['a.txt', './a.txt', 'a.txt/', 'keep//k.txt'] });
    expect(res.statusCode).toBe(200);
    expect(res.json().deleted.sort()).toEqual(['a.txt', 'keep/k.txt']);
    expect(res.json().failed).toEqual([]);
  });

  it('drops descendants of a folder listed in the same request', async () => {
    const res = await post({ paths: ['folder/nested/f2.txt', 'folder', 'folder/f1.txt'] });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.failed).toEqual([]);
    expect(body.deleted.sort()).toEqual(['folder', 'folder/f1.txt', 'folder/nested/f2.txt']);
    expect(existsSync(path.join(root, 'folder'))).toBe(false);
  });

  it('reports partial failures without aborting the rest or leaking host paths', async () => {
    const res = await post({ paths: ['missing.txt', 'a.txt', 'keep/nope/x.txt', 'b.txt'] });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.deleted.sort()).toEqual(['a.txt', 'b.txt']);
    expect(body.failed).toEqual(
      expect.arrayContaining([
        { path: 'missing.txt', error: 'Not found' },
        { path: 'keep/nope/x.txt', error: 'Not found' },
      ]),
    );
    expect(JSON.stringify(body)).not.toContain(sandbox);
    expect(existsSync(path.join(root, 'a.txt'))).toBe(false);
    expect(existsSync(path.join(root, 'b.txt'))).toBe(false);
  });
});

describe('POST /delete request validation', () => {
  it.each([
    ['no body', undefined],
    ['null body', null],
    ['missing paths', {}],
    ['paths not an array', { paths: 'a.txt' }],
    ['empty array', { paths: [] }],
    ['non-string entry', { paths: ['a.txt', 5] }],
    ['null entry', { paths: [null] }],
    ['object entry', { paths: [{ path: 'a.txt' }] }],
  ])('rejects %s with 400', async (_name, body) => {
    const res = await post(body);
    expect(res.statusCode).toBe(400);
    expect(existsSync(path.join(root, 'a.txt'))).toBe(true);
  });

  it('rejects more than the maximum number of paths', async () => {
    const paths = Array.from({ length: MAX_DELETE_PATHS + 1 }, (_, i) => `f${i}.txt`);
    expect((await post({ paths })).statusCode).toBe(400);
    const atLimit = Array.from({ length: MAX_DELETE_PATHS }, (_, i) => `f${i}.txt`);
    const res = await post({ paths: atLimit });
    expect(res.statusCode).toBe(200);
    expect(res.json().failed).toHaveLength(MAX_DELETE_PATHS); // none exist, all reported
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: { ...auth(tokens.admin), 'content-type': 'application/json' },
      payload: '{"paths": [',
    });
    expect(res.statusCode).toBe(400);
  });

  it.each([
    ['parent traversal', '../outside/secret.txt'],
    ['nested traversal', 'keep/../../outside/secret.txt'],
    ['absolute POSIX path', '/etc/passwd'],
    ['absolute path to the sandbox', '/outside/secret.txt'],
    ['Windows drive path', 'C:\\Windows\\win.ini'],
    ['drive-relative path', 'C:foo'],
    ['backslash path', 'keep\\k.txt'],
    ['null byte', 'a.txt\u0000.png'],
    ['empty path (root)', ''],
    ['dot (root)', '.'],
    ['slash only (root)', '/'],
    ['dot-slash (root)', './'],
  ])('rejects %s with 400 and deletes nothing', async (_name, bad) => {
    const res = await post({ paths: ['a.txt', bad] });
    expect(res.statusCode).toBe(400);
    expect(existsSync(path.join(root, 'a.txt'))).toBe(true); // validated up front, atomically
    expect(readFileSync(path.join(outside, 'secret.txt'), 'utf8')).toBe('top secret');
    expect(existsSync(root)).toBe(true);
  });

  it('treats an encoded traversal as a literal, non-existent name', async () => {
    const res = await post({ paths: ['%2e%2e/outside/secret.txt', '%252e%252e/x'] });
    expect(res.statusCode).toBe(200);
    expect(res.json().deleted).toEqual([]);
    expect(res.json().failed).toHaveLength(2);
    expect(existsSync(path.join(outside, 'secret.txt'))).toBe(true);
  });
});

describe('POST /delete and symlinks', () => {
  it('unlinks a symlink to an outside file and never touches the target', async () => {
    if (!trySymlink(path.join(outside, 'secret.txt'), path.join(root, 'leak.txt'))) return;
    const res = await post({ paths: ['leak.txt'] });
    expect(res.json()).toEqual({ deleted: ['leak.txt'], failed: [] });
    expect(() => lstatSync(path.join(root, 'leak.txt'))).toThrow();
    expect(readFileSync(path.join(outside, 'secret.txt'), 'utf8')).toBe('top secret');
  });

  it('unlinks a symlink to an outside directory without deleting its contents', async () => {
    if (!trySymlink(path.join(outside, 'dir'), path.join(root, 'evil'))) return;
    const res = await post({ paths: ['evil'] });
    expect(res.json()).toEqual({ deleted: ['evil'], failed: [] });
    expect(() => lstatSync(path.join(root, 'evil'))).toThrow();
    expect(readFileSync(path.join(outside, 'dir', 'inner.txt'), 'utf8')).toBe('inner');
  });

  it('refuses to reach files outside the root through a symlinked directory', async () => {
    if (!trySymlink(path.join(outside, 'dir'), path.join(root, 'evil'))) return;
    const res = await post({ paths: ['evil/inner.txt'] });
    expect(res.statusCode).toBe(200);
    expect(res.json().deleted).toEqual([]);
    expect(res.json().failed).toEqual([{ path: 'evil/inner.txt', error: 'Not found' }]);
    expect(readFileSync(path.join(outside, 'dir', 'inner.txt'), 'utf8')).toBe('inner');
  });

  it('does not follow symlinks found inside a folder being removed recursively', async () => {
    if (!trySymlink(path.join(outside, 'dir'), path.join(root, 'folder', 'link-out'))) return;
    const res = await post({ paths: ['folder'] });
    expect(res.json()).toEqual({ deleted: ['folder'], failed: [] });
    expect(existsSync(path.join(root, 'folder'))).toBe(false);
    expect(readFileSync(path.join(outside, 'dir', 'inner.txt'), 'utf8')).toBe('inner');
  });

  it('allows deleting through a symlinked directory that stays inside the root', async () => {
    if (!trySymlink(path.join(root, 'folder'), path.join(root, 'alias'))) return;
    const res = await post({ paths: ['alias/f1.txt'] });
    expect(res.json()).toEqual({ deleted: ['alias/f1.txt'], failed: [] });
    expect(existsSync(path.join(root, 'folder', 'f1.txt'))).toBe(false);
  });
});
