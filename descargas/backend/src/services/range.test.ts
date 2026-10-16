import { describe, expect, it } from 'vitest';
import { parseRange } from './range';

describe('parseRange', () => {
  it('serves the whole file when there is no usable Range header', () => {
    expect(parseRange(undefined, 100)).toEqual({ kind: 'none' });
    expect(parseRange('items=0-5', 100)).toEqual({ kind: 'none' });
    expect(parseRange('bytes=0-5,10-20', 100)).toEqual({ kind: 'none' });
  });

  it('parses closed, open-ended and suffix ranges', () => {
    expect(parseRange('bytes=0-9', 100)).toEqual({ kind: 'partial', start: 0, end: 9 });
    expect(parseRange('bytes=90-', 100)).toEqual({ kind: 'partial', start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ kind: 'partial', start: 90, end: 99 });
  });

  it('clamps an end beyond the file size', () => {
    expect(parseRange('bytes=50-1000', 100)).toEqual({ kind: 'partial', start: 50, end: 99 });
    expect(parseRange('bytes=-1000', 100)).toEqual({ kind: 'partial', start: 0, end: 99 });
  });

  it.each(['bytes=100-', 'bytes=100-200', 'bytes=50-10', 'bytes=-0', 'bytes=-', 'bytes=abc', 'bytes=1-2-3'])(
    'is unsatisfiable for %s',
    (h) => {
      expect(parseRange(h, 100)).toEqual({ kind: 'unsatisfiable' });
    },
  );

  it('is unsatisfiable on an empty file', () => {
    expect(parseRange('bytes=0-0', 0)).toEqual({ kind: 'unsatisfiable' });
  });
});
