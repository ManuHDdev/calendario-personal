import { randomBytes } from 'crypto';
import path from 'path';
import { HttpError } from '../errors';
import type { MediaType } from './types';

export const PHOTO_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
export const VIDEO_MAX_BYTES = 1024 * 1024 * 1024; // 1 GB (phone videos); streamed to disk, never buffered

const ASIN_RE = /^[A-Z0-9]{10}$/;
// Stored names are always generated server-side: letters, digits, '-' and '_',
// exactly one dot and a short lowercase extension. No separators, no '..'.
const STORED_FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}\.[a-z0-9]{2,5}$/;

/** Upper-cases and validates an ASIN. Throws 400 when it is not 10 chars [A-Z0-9]. */
export function parseAsin(raw: unknown): string {
  const asin = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!ASIN_RE.test(asin)) {
    throw new HttpError(400, 'InvalidAsin', 'ASIN must be 10 characters (A-Z, 0-9)');
  }
  return asin;
}

export function isValidAsin(raw: unknown): boolean {
  return typeof raw === 'string' && ASIN_RE.test(raw);
}

export function isValidStoredFilename(raw: unknown): raw is string {
  return typeof raw === 'string' && STORED_FILENAME_RE.test(raw);
}

export function parseStoredFilename(raw: unknown): string {
  if (!isValidStoredFilename(raw)) {
    throw new HttpError(400, 'InvalidFilename', 'Invalid media filename');
  }
  return raw;
}

interface MediaKind {
  type: MediaType;
  /** extension (lowercase, no dot) -> accepted MIME types */
  exts: Record<string, string[]>;
}

const KINDS: MediaKind[] = [
  {
    type: 'photo',
    exts: {
      jpg: ['image/jpeg'],
      jpeg: ['image/jpeg'],
      png: ['image/png'],
      webp: ['image/webp'],
      heic: ['image/heic', 'image/heif'],
      heif: ['image/heif', 'image/heic'],
    },
  },
  {
    type: 'video',
    exts: {
      mp4: ['video/mp4'],
      mov: ['video/quicktime'],
      webm: ['video/webm'],
    },
  },
];

export interface ClassifiedUpload {
  type: MediaType;
  /** Canonical lowercase extension used for the stored file name. */
  ext: string;
  mime: string;
}

export function maxBytesFor(type: MediaType): number {
  return type === 'photo' ? PHOTO_MAX_BYTES : VIDEO_MAX_BYTES;
}

/**
 * Decides photo vs video from the extension and checks the declared MIME is one
 * of the accepted types for that extension. The client file name is used ONLY to
 * read the extension; it never reaches the file system.
 */
export function classifyUpload(originalName: string, mimetype: string): ClassifiedUpload {
  const ext = path.extname(originalName ?? '').slice(1).toLowerCase();
  const mime = (mimetype ?? '').split(';')[0].trim().toLowerCase();
  for (const kind of KINDS) {
    const accepted = kind.exts[ext];
    if (!accepted) continue;
    if (!accepted.includes(mime)) {
      throw new HttpError(415, 'UnsupportedMediaType', `MIME type ${mime || '(none)'} does not match .${ext}`);
    }
    return { type: kind.type, ext: ext === 'jpeg' ? 'jpg' : ext, mime };
  }
  throw new HttpError(415, 'UnsupportedMediaType', `Unsupported file type .${ext || '(none)'}`);
}

/** Maps an extension to a MIME type for serving (and for the legacy importer). */
export function mimeForExtension(ext: string): string | undefined {
  const e = ext.replace(/^\./, '').toLowerCase();
  for (const kind of KINDS) {
    const accepted = kind.exts[e];
    if (accepted) return accepted[0];
  }
  return undefined;
}

export function assertSizeAllowed(type: MediaType, size: number): void {
  if (size > maxBytesFor(type)) {
    throw new HttpError(
      413,
      'PayloadTooLarge',
      `File too large: ${type} limit is ${maxBytesFor(type) / (1024 * 1024)} MB`,
    );
  }
}

/** `<timestamp>-<rand>.<ext>`, generated server-side. */
export function generateFilename(
  ext: string,
  now: number = Date.now(),
  rand: string = randomBytes(4).toString('hex'),
): string {
  return `${now}-${rand}.${ext}`;
}

/**
 * Absolute path of `<mediaRoot>/<ASIN>/<filename>`. Validates both segments and
 * double-checks that the resolved path stays inside `mediaRoot`.
 */
export function resolveMediaPath(mediaRoot: string, asin: string, filename: string): string {
  if (!isValidAsin(asin)) throw new HttpError(400, 'InvalidAsin', 'ASIN must be 10 characters (A-Z, 0-9)');
  parseStoredFilename(filename);
  const root = path.resolve(mediaRoot);
  const resolved = path.resolve(root, asin, filename);
  if (!resolved.startsWith(root + path.sep)) {
    throw new HttpError(400, 'InvalidFilename', 'Path escapes the media directory');
  }
  return resolved;
}
