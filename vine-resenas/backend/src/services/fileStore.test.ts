import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsFileStore } from './fileStore';

let dir: string;
beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'vine-store-'));
});
afterEach(async () => {
  await fsp.rm(dir, { recursive: true, force: true });
});

describe('FsFileStore', () => {
  it('writes under <dataDir>/media/<ASIN>/<file> and returns the size', async () => {
    const store = new FsFileStore(dir);
    const size = await store.save('B0FQBYHJ17', '1-a.jpg', Readable.from([Buffer.from('hello')]), 100);
    expect(size).toBe(5);
    expect(await fsp.readFile(path.join(dir, 'media', 'B0FQBYHJ17', '1-a.jpg'), 'utf8')).toBe('hello');
  });

  it('aborts and deletes the partial file when the size limit is exceeded', async () => {
    const store = new FsFileStore(dir);
    await expect(
      store.save('B0FQBYHJ17', '1-a.jpg', Readable.from([Buffer.alloc(60), Buffer.alloc(60)]), 100),
    ).rejects.toMatchObject({ statusCode: 413 });
    await expect(fsp.stat(path.join(dir, 'media', 'B0FQBYHJ17', '1-a.jpg'))).rejects.toThrow();
  });

  it('refuses traversal attempts', async () => {
    const store = new FsFileStore(dir);
    await expect(store.save('B0FQBYHJ17', '../../x.jpg', Readable.from(['a']), 100)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(() => store.pathFor('../..', 'a.jpg')).toThrow();
  });

  it('remove is idempotent', async () => {
    const store = new FsFileStore(dir);
    await store.save('B0FQBYHJ17', '1-a.jpg', Readable.from(['a']), 100);
    await store.remove('B0FQBYHJ17', '1-a.jpg');
    await expect(store.remove('B0FQBYHJ17', '1-a.jpg')).resolves.toBeUndefined();
  });
});
