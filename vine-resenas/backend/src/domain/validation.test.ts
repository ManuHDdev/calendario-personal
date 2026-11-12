import path from 'path';
import { describe, it, expect } from 'vitest';
import { HttpError } from '../errors';
import {
  PHOTO_MAX_BYTES,
  VIDEO_MAX_BYTES,
  assertSizeAllowed,
  classifyUpload,
  generateFilename,
  isValidStoredFilename,
  maxBytesFor,
  parseAsin,
  resolveMediaPath,
} from './validation';

describe('parseAsin', () => {
  it('accepts and upper-cases a valid ASIN', () => {
    expect(parseAsin('b0fqbyhj17')).toBe('B0FQBYHJ17');
  });
  it.each(['', 'B0FQBYHJ1', 'B0FQBYHJ177', '../../etc/p', 'B0FQBYHJ1!', 'B0FQ BYHJ1'])('rejects %j', (v) => {
    expect(() => parseAsin(v)).toThrow(HttpError);
  });
  it('rejects non-strings', () => {
    expect(() => parseAsin(undefined)).toThrow(HttpError);
    expect(() => parseAsin(1234567890)).toThrow(HttpError);
  });
});

describe('classifyUpload', () => {
  it.each([
    ['a.jpg', 'image/jpeg', 'photo', 'jpg'],
    ['A.JPEG', 'image/jpeg', 'photo', 'jpg'],
    ['a.png', 'image/png', 'photo', 'png'],
    ['a.webp', 'image/webp', 'photo', 'webp'],
    ['a.heic', 'image/heic', 'photo', 'heic'],
    ['a.heif', 'image/heif', 'photo', 'heif'],
    ['a.mp4', 'video/mp4', 'video', 'mp4'],
    ['a.MOV', 'video/quicktime', 'video', 'mov'],
    ['a.webm', 'video/webm; codecs=vp9', 'video', 'webm'],
  ])('accepts %s (%s)', (name, mime, type, ext) => {
    expect(classifyUpload(name, mime)).toMatchObject({ type, ext });
  });
  it('rejects a MIME that does not match the extension', () => {
    expect(() => classifyUpload('a.jpg', 'video/mp4')).toThrow(/does not match/);
    expect(() => classifyUpload('a.mp4', 'image/jpeg')).toThrow(HttpError);
  });
  it.each([
    ['a.gif', 'image/gif'],
    ['a.svg', 'image/svg+xml'],
    ['a.exe', 'application/octet-stream'],
    ['noext', 'image/jpeg'],
    ['a.php.jpg.txt', 'image/jpeg'],
  ])('rejects unsupported %s', (name, mime) => {
    expect(() => classifyUpload(name, mime)).toThrow(HttpError);
  });
  it('uses the status 415', () => {
    expect.assertions(1);
    try {
      classifyUpload('a.gif', 'image/gif');
    } catch (e) {
      expect((e as HttpError).statusCode).toBe(415);
    }
  });
});

describe('size limits', () => {
  it('has 25 MB for photos and 1 GB for videos', () => {
    expect(maxBytesFor('photo')).toBe(25 * 1024 * 1024);
    expect(maxBytesFor('video')).toBe(1024 * 1024 * 1024);
  });
  it('accepts up to the limit and rejects above with 413', () => {
    expect.assertions(5);
    expect(() => assertSizeAllowed('photo', PHOTO_MAX_BYTES)).not.toThrow();
    expect(() => assertSizeAllowed('video', VIDEO_MAX_BYTES)).not.toThrow();
    expect(() => assertSizeAllowed('photo', PHOTO_MAX_BYTES + 1)).toThrow(HttpError);
    try {
      assertSizeAllowed('video', VIDEO_MAX_BYTES + 1);
    } catch (e) {
      expect((e as HttpError).statusCode).toBe(413);
      expect((e as HttpError).code).toBe('PayloadTooLarge');
    }
  });
});

describe('generateFilename / stored filename', () => {
  it('builds <timestamp>-<rand>.<ext> and it is a valid stored name', () => {
    const name = generateFilename('jpg', 1731300000000, 'a1b2c3d4');
    expect(name).toBe('1731300000000-a1b2c3d4.jpg');
    expect(isValidStoredFilename(name)).toBe(true);
    expect(isValidStoredFilename(generateFilename('png'))).toBe(true);
  });
  it.each([
    '../x.jpg',
    'a/b.jpg',
    'a\\b.jpg',
    '..jpg',
    '.hidden.jpg',
    'a.jpg.php',
    'a b.jpg',
    '',
    'x'.repeat(200) + '.jpg',
    'a.JPG',
  ])('rejects %j', (v) => {
    expect(isValidStoredFilename(v)).toBe(false);
  });
});

describe('resolveMediaPath', () => {
  const root = path.resolve('/tmp/vine-test/media');
  it('resolves inside the media root', () => {
    expect(resolveMediaPath(root, 'B0FQBYHJ17', '1-abc.jpg')).toBe(path.join(root, 'B0FQBYHJ17', '1-abc.jpg'));
  });
  it('blocks traversal in either segment', () => {
    expect(() => resolveMediaPath(root, 'B0FQBYHJ17', '../../etc/passwd')).toThrow(HttpError);
    expect(() => resolveMediaPath(root, '../..', '1-abc.jpg')).toThrow(HttpError);
    expect(() => resolveMediaPath(root, 'B0FQBYHJ17', '..%2f..%2fx.jpg')).toThrow(HttpError);
    expect(() => resolveMediaPath(root, 'B0FQBYHJ17', '/etc/passwd')).toThrow(HttpError);
  });
});
