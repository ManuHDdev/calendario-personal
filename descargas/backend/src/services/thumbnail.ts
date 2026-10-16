import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';

/** Widths the endpoint will produce. A whitelist keeps the cache (and CPU) bounded. */
export const THUMB_WIDTHS = [160, 320, 640] as const;
export const DEFAULT_THUMB_WIDTH = 320;
const THUMB_QUALITY = 75;
// Phone panoramas reach ~100 MP; anything bigger is refused instead of decoded.
const MAX_INPUT_PIXELS = 120_000_000;
const MAX_CONCURRENT = 2;

/** Extensions we try to thumbnail. SVG is deliberately absent (active content). */
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
// What libvips reports for the content, whatever the extension claims.
const FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'heif']);

export class ThumbError extends Error {
  constructor(
    public readonly statusCode: 400 | 415,
    message: string,
  ) {
    super(message);
    this.name = 'ThumbError';
  }
}

sharp.cache(false); // do not keep decoded files around between requests

/** Parses `?w=`: missing -> default, otherwise it must be exactly one of THUMB_WIDTHS. */
export function parseThumbWidth(input: unknown): number {
  if (input === undefined || input === null || input === '') return DEFAULT_THUMB_WIDTH;
  if (typeof input !== 'string' || !/^\d{1,4}$/.test(input)) throw new ThumbError(400, 'Invalid width');
  const width = Number(input);
  if (!(THUMB_WIDTHS as readonly number[]).includes(width)) {
    throw new ThumbError(400, `Width must be one of ${THUMB_WIDTHS.join(', ')}`);
  }
  return width;
}

export function isThumbnailable(fileName: string): boolean {
  return EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

/** Minimal counting semaphore so a grid of photos cannot decode them all at once. */
class Limiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

export interface ThumbSource {
  /** Real absolute path (already proven to live inside the root). */
  absolute: string;
  size: number;
  mtimeMs: number;
}

export class ThumbnailService {
  private readonly limiter = new Limiter(MAX_CONCURRENT);
  private readonly inFlight = new Map<string, Promise<Buffer>>();

  constructor(private readonly cacheDir: string) {}

  static defaultCacheDir(): string {
    return process.env.THUMB_CACHE_DIR || path.join(os.tmpdir(), 'descargas-thumbs');
  }

  /** Content-addressed key: changes whenever the file or the requested width does. */
  keyFor(src: ThumbSource, width: number): string {
    return createHash('sha1').update(`${src.absolute}\0${src.size}\0${src.mtimeMs}\0${width}`).digest('hex');
  }

  private cachePath(key: string): string {
    return path.join(this.cacheDir, key.slice(0, 2), `${key}.webp`);
  }

  /** Cached bytes when present, otherwise generates (at most once per key at a time). */
  async get(src: ThumbSource, width: number): Promise<Buffer> {
    const key = this.keyFor(src, width);
    const file = this.cachePath(key);
    try {
      return await fs.readFile(file);
    } catch {
      // miss: fall through and generate
    }
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const job = this.limiter
      .run(() => this.generate(src, width, file))
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, job);
    return job;
  }

  private async generate(src: ThumbSource, width: number, file: string): Promise<Buffer> {
    let output: Buffer;
    try {
      const input = sharp(src.absolute, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'none' });
      const meta = await input.metadata();
      // Trust the decoded content, not the file name: an .svg renamed .jpg must not be rasterised.
      if (!meta.format || !FORMATS.has(meta.format)) throw new ThumbError(415, 'Unsupported image format');
      output = await input
        .rotate() // apply EXIF orientation, then drop it
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: THUMB_QUALITY })
        .toBuffer();
    } catch (err) {
      if (err instanceof ThumbError) throw err;
      throw new ThumbError(415, 'Cannot generate a thumbnail for this file');
    }
    await this.store(file, output);
    return output;
  }

  /** Best effort and atomic (tmp + rename): a read-only or full cache dir only costs speed. */
  private async store(file: string, data: Buffer): Promise<void> {
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(tmp, data);
      await fs.rename(tmp, file);
    } catch {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
    }
  }
}
