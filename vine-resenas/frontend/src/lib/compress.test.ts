import { describe, expect, it } from 'vitest';
import { isCompressible, jpegName, pickSmaller, targetSize } from './compress';

describe('targetSize', () => {
  it('keeps small images untouched', () => {
    expect(targetSize(1200, 800)).toEqual({ width: 1200, height: 800 });
  });
  it('scales landscape so the longest side is 2000', () => {
    expect(targetSize(4000, 3000)).toEqual({ width: 2000, height: 1500 });
  });
  it('scales portrait', () => {
    expect(targetSize(3000, 6000)).toEqual({ width: 1000, height: 2000 });
  });
  it('never returns a zero dimension', () => {
    expect(targetSize(100000, 10).height).toBeGreaterThanOrEqual(1);
  });
});

describe('isCompressible', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (type) => {
    expect(isCompressible({ type })).toBe(true);
  });
  it.each(['image/gif', 'image/heic', 'image/heif', 'video/mp4', 'image/svg+xml', ''])('skips %s', (type) => {
    expect(isCompressible({ type })).toBe(false);
  });
});

describe('pickSmaller', () => {
  it('uses the compressed file when strictly smaller', () => {
    const a = { size: 100 };
    const b = { size: 60 };
    expect(pickSmaller(a, b)).toBe(b);
  });
  it('keeps the original when not smaller or null', () => {
    const a = { size: 100 };
    expect(pickSmaller(a, { size: 100 })).toBe(a);
    expect(pickSmaller(a, { size: 120 })).toBe(a);
    expect(pickSmaller(a, null)).toBe(a);
  });
});

describe('jpegName', () => {
  it('swaps the extension', () => {
    expect(jpegName('IMG_1.PNG')).toBe('IMG_1.jpg');
    expect(jpegName('a.b.webp')).toBe('a.b.jpg');
    expect(jpegName('noext')).toBe('noext.jpg');
  });
});
