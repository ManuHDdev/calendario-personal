import { describe, it, expect } from 'vitest';
import { parseRange, presentSummary } from './presenters';

describe('parseRange', () => {
  it('returns null without a header or with garbage', () => {
    expect(parseRange(undefined, 100)).toBeNull();
    expect(parseRange('items=0-1', 100)).toBeNull();
  });
  it('parses closed, open and suffix ranges', () => {
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=0-999', 100)).toEqual({ start: 0, end: 99 });
  });
  it('flags unsatisfiable ranges', () => {
    expect(parseRange('bytes=100-', 100)).toBe('invalid');
    expect(parseRange('bytes=50-10', 100)).toBe('invalid');
  });
});

describe('presentSummary', () => {
  it('summarizes media and picks the first photo as thumbnail', () => {
    const s = presentSummary(
      {
        asin: 'AAAAAAAAAA',
        titulo: 't',
        descripcion: '',
        feedback: 'x',
        estrellas: 4,
        estado: 'pendiente',
        resena_producto: '',
        resena_resumida: '',
        resena_extendida: '',
        created_at: '',
        updated_at: '',
        media: [
          { id: 1, asin: 'AAAAAAAAAA', filename: 'v.mp4', type: 'video', size: 1, created_at: '' },
          { id: 2, asin: 'AAAAAAAAAA', filename: 'p1.jpg', type: 'photo', size: 1, created_at: '' },
          { id: 3, asin: 'AAAAAAAAAA', filename: 'p2.jpg', type: 'photo', size: 1, created_at: '' },
        ],
      },
      '/vine-resenas/api/ui',
    );
    expect(s).toMatchObject({ photo_count: 2, has_video: true, has_feedback: true });
    expect(s.thumbnail_url).toBe('/vine-resenas/api/ui/media/AAAAAAAAAA/p1.jpg');
  });
});
