import { describe, expect, it } from 'vitest';
import { checkFileSize, tooLargeMessage, VIDEO_MAX_BYTES, PHOTO_MAX_BYTES } from './limits';

describe('upload limits', () => {
  it('accepts a video of exactly 1 GB and rejects one byte more', () => {
    const v = { type: 'video/mp4', name: 'a.mp4' };
    expect(checkFileSize({ ...v, size: VIDEO_MAX_BYTES })).toBeNull();
    expect(checkFileSize({ ...v, size: VIDEO_MAX_BYTES + 1 })).toBe('El vídeo supera el límite de 1 GB');
  });

  it('keeps photos at 25 MB', () => {
    const p = { type: 'image/jpeg', name: 'a.jpg' };
    expect(checkFileSize({ ...p, size: PHOTO_MAX_BYTES })).toBeNull();
    expect(checkFileSize({ ...p, size: PHOTO_MAX_BYTES + 1 })).toBe('La foto supera el límite de 25 MB');
  });

  it('detects videos by extension when the MIME type is empty', () => {
    expect(tooLargeMessage({ type: '', name: 'clip.MOV' })).toBe('El vídeo supera el límite de 1 GB');
  });
});
