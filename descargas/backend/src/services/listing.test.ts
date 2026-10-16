import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync, realpathSync } from 'fs';
import os from 'os';
import path from 'path';
import { compareEntries, listDirectory, type DirEntry } from './listing';
import { getMimeInfo } from './mime';
import { redactUrl } from './redact';

let root: string;

function touch(rel: string, content: string, mtimeSeconds: number) {
  const full = path.join(root, rel);
  writeFileSync(full, content);
  utimesSync(full, mtimeSeconds, mtimeSeconds);
}

beforeAll(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'descargas-list-')));
  touch('old.jpg', 'x'.repeat(10), 1_600_000_000);
  touch('new.png', 'x'.repeat(20), 1_700_000_000);
  touch('movie.mp4', 'x'.repeat(30), 1_650_000_000);
  touch('song.mp3', 'x', 1_650_000_001);
  touch('doc.pdf', 'x', 1_650_000_002);
  touch('notes.txt', 'x', 1_650_000_003);
  touch('blob.bin', 'x', 1_650_000_004);
  touch('.hidden', 'x', 1_800_000_000);
  mkdirSync(path.join(root, 'zdir'));
  mkdirSync(path.join(root, 'adir'));
  utimesSync(path.join(root, 'zdir'), 1_500_000_000, 1_500_000_000);
  utimesSync(path.join(root, 'adir'), 1_500_000_100, 1_500_000_100);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('listDirectory', () => {
  it('lists directories first, then files newest first, skipping hidden files', async () => {
    const entries = await listDirectory(root, root, '');
    expect(entries.map((e) => e.name)).toEqual([
      'adir', 'zdir', // dirs first, newest first
      'new.png', 'blob.bin', 'notes.txt', 'doc.pdf', 'song.mp3', 'movie.mp4', 'old.jpg',
    ]);
  });

  it('reports size, ISO mtime, mime and category', async () => {
    const entries = await listDirectory(root, root, '');
    const byName = Object.fromEntries(entries.map((e) => [e.name, e]));
    expect(byName['new.png']).toMatchObject({
      type: 'file', size: 20, mime: 'image/png', category: 'image', path: 'new.png',
      mtime: new Date(1_700_000_000_000).toISOString(),
    });
    expect(byName['movie.mp4']).toMatchObject({ mime: 'video/mp4', category: 'video' });
    expect(byName['song.mp3']).toMatchObject({ mime: 'audio/mpeg', category: 'audio' });
    expect(byName['doc.pdf']).toMatchObject({ mime: 'application/pdf', category: 'pdf' });
    expect(byName['notes.txt']).toMatchObject({ mime: 'text/plain', category: 'text' });
    expect(byName['blob.bin']).toMatchObject({ mime: 'application/octet-stream', category: 'other' });
    expect(byName['adir']).toMatchObject({ type: 'dir', mime: null, category: null, size: 0 });
  });

  it('prefixes entry paths with the listed directory', async () => {
    const entries = await listDirectory(root, root, 'photos/2026');
    expect(entries.find((e) => e.name === 'old.jpg')?.path).toBe('photos/2026/old.jpg');
  });
});

describe('compareEntries', () => {
  const base: DirEntry = {
    name: 'a', path: 'a', type: 'file', size: 0, mtime: '2026-01-01T00:00:00.000Z', mime: null, category: null,
  };
  it('breaks mtime ties by name', () => {
    expect(compareEntries({ ...base, name: 'b' }, { ...base, name: 'a' })).toBeGreaterThan(0);
  });
  it('puts directories before files regardless of age', () => {
    const dir = { ...base, type: 'dir' as const, mtime: '2000-01-01T00:00:00.000Z' };
    expect(compareEntries(dir, base)).toBeLessThan(0);
  });
});

describe('getMimeInfo', () => {
  it('is case-insensitive on extensions', () => {
    expect(getMimeInfo('PHOTO.JPG')).toMatchObject({ category: 'image', mime: 'image/jpeg' });
  });
  it('flags active content as download-only and never as an image', () => {
    expect(getMimeInfo('x.svg')).toMatchObject({ category: 'other', forceDownload: true });
    expect(getMimeInfo('x.html')).toMatchObject({ forceDownload: true });
  });
  it('falls back to octet-stream', () => {
    expect(getMimeInfo('noext')).toMatchObject({ mime: 'application/octet-stream', category: 'other' });
  });
});

describe('redactUrl', () => {
  it('masks the token parameter wherever it appears', () => {
    expect(redactUrl('/descargas/api/file?path=a.jpg&token=eyJ.abc.def')).toBe('/descargas/api/file?path=a.jpg&token=[redacted]');
    expect(redactUrl('/x?token=abc&path=a')).toBe('/x?token=[redacted]&path=a');
  });
  it('leaves other urls untouched', () => {
    expect(redactUrl('/descargas/api/list?path=a')).toBe('/descargas/api/list?path=a');
    expect(redactUrl(undefined)).toBeUndefined();
  });
});
