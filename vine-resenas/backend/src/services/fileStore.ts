import { createReadStream, promises as fsp } from 'fs';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { HttpError } from '../errors';
import { formatLimit, resolveMediaPath } from '../domain/validation';

/** Port over the media files on disk. Tests use an in-memory fake. */
export interface FileStore {
  /** Streams `source` to `<media>/<asin>/<filename>`; rejects (and cleans up) beyond `maxBytes`. Returns bytes written. */
  save(asin: string, filename: string, source: Readable, maxBytes: number): Promise<number>;
  remove(asin: string, filename: string): Promise<void>;
  /** Size in bytes of an existing stored file, or null when it does not exist. */
  sizeOf(asin: string, filename: string): Promise<number | null>;
  /** Absolute path for serving. */
  pathFor(asin: string, filename: string): string;
}

export class FsFileStore implements FileStore {
  readonly mediaRoot: string;

  constructor(dataDir: string) {
    this.mediaRoot = path.join(path.resolve(dataDir), 'media');
  }

  pathFor(asin: string, filename: string): string {
    return resolveMediaPath(this.mediaRoot, asin, filename);
  }

  async save(asin: string, filename: string, source: Readable, maxBytes: number): Promise<number> {
    const target = this.pathFor(asin, filename);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    let written = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        written += chunk.length;
        if (written > maxBytes) {
          cb(new HttpError(413, 'PayloadTooLarge', `File too large (limit ${formatLimit(maxBytes)})`));
          return;
        }
        cb(null, chunk);
      },
    });
    // 'wx' fails with EEXIST on a pre-existing file: that file is not ours, so it must never be removed.
    let handle: fsp.FileHandle;
    try {
      handle = await fsp.open(target, 'wx');
    } catch (err) {
      source.resume();
      throw err;
    }
    try {
      await pipeline(source, limiter, handle.createWriteStream());
    } catch (err) {
      await fsp.rm(target, { force: true });
      source.resume();
      throw err;
    }
    return written;
  }

  async sizeOf(asin: string, filename: string): Promise<number | null> {
    try {
      return (await fsp.stat(this.pathFor(asin, filename))).size;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async remove(asin: string, filename: string): Promise<void> {
    await fsp.rm(this.pathFor(asin, filename), { force: true });
  }

  /** Read stream (optionally a byte range) for the serving routes. */
  open(asin: string, filename: string, range?: { start: number; end: number }) {
    return createReadStream(this.pathFor(asin, filename), range);
  }

  async stat(asin: string, filename: string) {
    return fsp.stat(this.pathFor(asin, filename));
  }
}
