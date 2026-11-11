import { Readable } from 'stream';
import { describe, it, expect } from 'vitest';
import { HttpError } from '../errors';
import { FakeRepo, FakeStore } from '../testing/fakes';
import { removeMedia, storeUpload } from './mediaService';

const ASIN = 'B0FQBYHJ17';

function setup() {
  const repo = new FakeRepo();
  repo.seed({ asin: ASIN });
  const store = new FakeStore();
  let n = 0;
  const deps = { repo, store, now: () => 1000 + n, rand: () => `r${n++}` };
  const upload = (name: string, mime: string, data = 'x') => ({
    originalName: name,
    mimetype: mime,
    stream: Readable.from([Buffer.from(data)]),
  });
  return { repo, store, deps, upload };
}

describe('storeUpload', () => {
  it('stores photos under a server-generated name, keeping many', async () => {
    const { deps, repo, store, upload } = setup();
    const a = await storeUpload(deps, ASIN, upload('../../evil name.JPG', 'image/jpeg', 'abc'));
    const b = await storeUpload(deps, ASIN, upload('b.png', 'image/png'));
    expect(a.media.filename).toMatch(/^\d+-r\d+\.jpg$/);
    expect(a.media.size).toBe(3);
    expect(repo.media).toHaveLength(2);
    expect(store.files.size).toBe(2);
    expect(b.replaced).toEqual([]);
  });

  it('replaces the previous video (row and file) when a new one is uploaded', async () => {
    const { deps, repo, store, upload } = setup();
    const first = await storeUpload(deps, ASIN, upload('a.mp4', 'video/mp4'));
    await storeUpload(deps, ASIN, upload('p.jpg', 'image/jpeg'));
    const second = await storeUpload(deps, ASIN, upload('b.mov', 'video/quicktime'));

    expect(second.replaced).toEqual([first.media.filename]);
    const videos = repo.media.filter((m) => m.type === 'video');
    expect(videos).toHaveLength(1);
    expect(videos[0].filename).toBe(second.media.filename);
    expect(store.files.has(`${ASIN}/${first.media.filename}`)).toBe(false);
    expect(store.files.has(`${ASIN}/${second.media.filename}`)).toBe(true);
    expect(repo.media.filter((m) => m.type === 'photo')).toHaveLength(1);
  });

  it('keeps the old video when the new upload fails', async () => {
    const { deps, repo, upload } = setup();
    const first = await storeUpload(deps, ASIN, upload('a.mp4', 'video/mp4'));
    await expect(storeUpload(deps, ASIN, upload('b.mp4', 'image/jpeg'))).rejects.toThrow(HttpError);
    expect(repo.media.map((m) => m.filename)).toEqual([first.media.filename]);
  });

  it('rejects invalid types before writing anything', async () => {
    const { deps, store, upload } = setup();
    await expect(storeUpload(deps, ASIN, upload('a.exe', 'application/octet-stream'))).rejects.toMatchObject({
      statusCode: 415,
    });
    expect(store.files.size).toBe(0);
  });

  it('404s for an unknown product', async () => {
    const { deps, upload } = setup();
    await expect(storeUpload(deps, 'ZZZZZZZZZZ', upload('a.jpg', 'image/jpeg'))).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('removes the file when registering the row fails', async () => {
    const { deps, repo, store, upload } = setup();
    repo.addMedia = async () => {
      throw new Error('db down');
    };
    await expect(storeUpload(deps, ASIN, upload('a.jpg', 'image/jpeg'))).rejects.toThrow('db down');
    expect(store.files.size).toBe(0);
  });
});

describe('removeMedia', () => {
  it('deletes row and file, and reports unknown media', async () => {
    const { deps, repo, store, upload } = setup();
    const r = await storeUpload(deps, ASIN, upload('a.jpg', 'image/jpeg'));
    expect(await removeMedia(deps, ASIN, r.media.filename)).toBe(true);
    expect(repo.media).toHaveLength(0);
    expect(store.files.size).toBe(0);
    expect(await removeMedia(deps, ASIN, r.media.filename)).toBe(false);
  });
});
