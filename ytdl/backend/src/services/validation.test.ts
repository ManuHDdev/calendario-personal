import { describe, it, expect } from 'vitest';
import {
  isAllowedYoutubeUrl,
  isValidFormat,
  contentTypeFor,
  sanitizeFilename,
  buildFilename,
  contentDispositionFor,
} from './validation';

describe('isAllowedYoutubeUrl', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'http://youtu.be/dQw4w9WgXcQ',
  ])('accepts a valid YouTube host: %s', (url) => {
    expect(isAllowedYoutubeUrl(url)).toBe(true);
  });

  it.each([
    'https://example.com/video',
    'https://not-youtube.com/watch?v=1',
    'https://evil.com/?redirect=youtube.com',
    'https://youtube.com.evil.com/watch',
    'ftp://youtube.com/watch',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'not a url at all',
    '',
    'https://vimeo.com/12345',
  ])('rejects a non-YouTube or malformed URL: %s', (url) => {
    expect(isAllowedYoutubeUrl(url)).toBe(false);
  });
});

describe('isValidFormat', () => {
  it.each(['mp4', 'mp3'])('accepts %s', (format) => {
    expect(isValidFormat(format)).toBe(true);
  });

  it.each(['avi', 'mkv', 'MP4', '', undefined, null, 123])('rejects %s', (format) => {
    expect(isValidFormat(format)).toBe(false);
  });
});

describe('contentTypeFor', () => {
  it('maps mp4 to video/mp4', () => {
    expect(contentTypeFor('mp4')).toBe('video/mp4');
  });

  it('maps mp3 to audio/mpeg', () => {
    expect(contentTypeFor('mp3')).toBe('audio/mpeg');
  });
});

describe('sanitizeFilename', () => {
  it('strips slashes and backslashes', () => {
    expect(sanitizeFilename('foo/bar\\baz')).toBe('foo_bar_baz');
  });

  it('strips control characters and quotes', () => {
    expect(sanitizeFilename('title\nwith\tcontrol"chars')).toBe('titlewithcontrolchars');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeFilename('  spaced title  ')).toBe('spaced title');
  });

  it('falls back to "video" when the result is empty', () => {
    expect(sanitizeFilename('   ')).toBe('video');
    expect(sanitizeFilename('\x00\x1f"')).toBe('video');
  });
});

describe('buildFilename', () => {
  it('appends the extension for the given format', () => {
    expect(buildFilename('My Video', 'mp4')).toBe('My Video.mp4');
    expect(buildFilename('My Song', 'mp3')).toBe('My Song.mp3');
  });
});

describe('contentDispositionFor', () => {
  it('keeps a plain ASCII filename identical in both parameters', () => {
    const header = contentDispositionFor('My Video.mp4');
    expect(header).toBe(`attachment; filename="My Video.mp4"; filename*=UTF-8''My%20Video.mp4`);
  });

  it('replaces non-ASCII characters in the fallback but preserves them via filename*', () => {
    const header = contentDispositionFor('Pelear es Mejor de lo que Parece (según la ciencia).mp4');
    expect(header).toContain('filename="Pelear es Mejor de lo que Parece (seg_n la ciencia).mp4"');
    expect(header).toContain(
      `filename*=UTF-8''${encodeURIComponent(
        'Pelear es Mejor de lo que Parece (según la ciencia).mp4',
      )}`,
    );
  });

  it('escapes double quotes in the ASCII fallback so the header stays well-formed', () => {
    const header = contentDispositionFor('a "quoted" title.mp3');
    expect(header).toContain(`filename="a 'quoted' title.mp3"`);
  });
});
