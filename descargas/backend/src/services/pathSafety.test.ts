import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, realpathSync } from 'fs';
import os from 'os';
import path from 'path';
import { PathError, parseRelativePath, resolveSafePath } from './pathSafety';

let sandbox: string;
let root: string;
let outside: string;
let symlinksSupported = true;

beforeAll(() => {
  sandbox = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'descargas-path-')));
  root = path.join(sandbox, 'root');
  outside = path.join(sandbox, 'outside');
  mkdirSync(path.join(root, 'sub'), { recursive: true });
  mkdirSync(outside);
  writeFileSync(path.join(root, 'a.txt'), 'a');
  writeFileSync(path.join(root, 'sub', 'b.txt'), 'b');
  writeFileSync(path.join(outside, 'secret.txt'), 'secret');
  // A sibling whose name shares the root as string prefix: "root-evil" must not pass a naive startsWith.
  mkdirSync(path.join(sandbox, 'root-evil'));
  writeFileSync(path.join(sandbox, 'root-evil', 'x.txt'), 'x');

  try {
    symlinkSync(outside, path.join(root, 'link-dir'), 'junction');
    symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'link-file'));
    symlinkSync(path.join(root, 'sub'), path.join(root, 'link-inside'), 'junction');
    symlinkSync(path.join(sandbox, 'root-evil'), path.join(root, 'link-prefix'), 'junction');
  } catch {
    symlinksSupported = false; // Windows without symlink privilege
  }
});

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('parseRelativePath', () => {
  it('treats empty input as the root', () => {
    expect(parseRelativePath(undefined)).toEqual([]);
    expect(parseRelativePath('')).toEqual([]);
    expect(parseRelativePath('/'.slice(1))).toEqual([]);
  });

  it('normalises redundant separators and dots', () => {
    expect(parseRelativePath('sub//./b.txt')).toEqual(['sub', 'b.txt']);
    expect(parseRelativePath('sub/')).toEqual(['sub']);
  });

  it.each(['..', '../x', 'sub/../../x', 'sub/..', 'a/b/../../..'])('rejects traversal %s', (p) => {
    expect(() => parseRelativePath(p)).toThrow(PathError);
  });

  it.each(['/etc/passwd', '\\windows\\system32', 'C:\\Windows', 'c:/windows', '\\\\server\\share'])(
    'rejects absolute path %s',
    (p) => {
      expect(() => parseRelativePath(p)).toThrow(/Absolute|Invalid/);
    },
  );

  it('rejects null bytes, backslashes, non-strings and huge input', () => {
    expect(() => parseRelativePath('a\0b')).toThrow(PathError);
    expect(() => parseRelativePath('sub\\b.txt')).toThrow(PathError);
    expect(() => parseRelativePath(['a'])).toThrow(PathError);
    expect(() => parseRelativePath('a'.repeat(5000))).toThrow(PathError);
  });

  it('does not decode percent escapes itself (the HTTP layer already did once)', () => {
    // A literal "%2e%2e" is just an odd file name: it must NOT be treated as "..".
    expect(parseRelativePath('%2e%2e')).toEqual(['%2e%2e']);
  });
});

describe('resolveSafePath', () => {
  it('resolves the root', async () => {
    const r = await resolveSafePath(root, '');
    expect(r.relative).toBe('');
    expect(r.stat.isDirectory()).toBe(true);
  });

  it('resolves nested files', async () => {
    const r = await resolveSafePath(root, 'sub/b.txt');
    expect(r.relative).toBe('sub/b.txt');
    expect(r.stat.isFile()).toBe(true);
  });

  it('reports missing files as 404', async () => {
    await expect(resolveSafePath(root, 'nope.txt')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects traversal with 400 before touching the filesystem', async () => {
    await expect(resolveSafePath(root, '../outside/secret.txt')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('reports a missing root as 404', async () => {
    await expect(resolveSafePath(path.join(sandbox, 'missing'), '')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects a symlinked directory that escapes the root', async (ctx) => {
    if (!symlinksSupported) return ctx.skip();
    await expect(resolveSafePath(root, 'link-dir')).rejects.toMatchObject({ statusCode: 404 });
    await expect(resolveSafePath(root, 'link-dir/secret.txt')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects a symlinked file that escapes the root', async (ctx) => {
    if (!symlinksSupported) return ctx.skip();
    await expect(resolveSafePath(root, 'link-file')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('is not fooled by a sibling folder sharing the root name as prefix', async (ctx) => {
    if (!symlinksSupported) return ctx.skip();
    await expect(resolveSafePath(root, 'link-prefix/x.txt')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('allows symlinks that stay inside the root', async (ctx) => {
    if (!symlinksSupported) return ctx.skip();
    const r = await resolveSafePath(root, 'link-inside/b.txt');
    expect(r.stat.isFile()).toBe(true);
  });
});
