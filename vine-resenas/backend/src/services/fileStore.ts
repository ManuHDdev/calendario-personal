import { createReadStream, promises as fsp } from 'fs';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { HttpError } from '../errors';
import { resolveMediaPath } from '../domain/validation';

/** Port over the media files on disk. Tests use an in-memory fake. */
export interface FileStore {
  /** Streams `source` to `<media>/<asin>/<filename>`; rejects (and cleans up) beyond `maxBytes`. Returns bytes written. */
  save(asin: string, filename: string, source: Readable, maxBytes: number): Promise<number>;
  remove(asin: string, filename: string): Promise<void>;
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
          cb(new HttpError(413, 'PayloadTooLarge', `File too large (limit ${maxBytes / (1024 * 1024)} MB)`));
          return;
        }
        cb(null, chunk);
      },
    });
    try {
      await pipeline(source, limiter, (await fsp.open(target, 'wx')).createWriteStream());
    } catch (err) {
      await fsp.rm(target, { force: true });
      source.resume();
      throw err;
    }
    return written;
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
