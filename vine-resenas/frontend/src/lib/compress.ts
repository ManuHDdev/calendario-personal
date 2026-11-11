export const MAX_SIDE = 2000;
export const JPEG_QUALITY = 0.85;

/** Scales (w,h) down so the longest side is at most `max`; never upscales. */
export function targetSize(w: number, h: number, max = MAX_SIDE): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= max) return { width: w, height: h };
  const k = max / longest;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** Only still raster images: not gifs, videos, svg nor HEIC (browsers usually cannot decode it). */
export function isCompressible(file: { type: string }): boolean {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
}

/** Keep the compressed result only when it is strictly smaller than the original. */
export function pickSmaller<T extends { size: number }>(original: T, compressed: T | null): T {
  return compressed && compressed.size < original.size ? compressed : original;
}

export function jpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '');
  return `${base || 'foto'}.jpg`;
}

/**
 * Downscales and re-encodes as JPEG. Returns the original file when the type is not
 * compressible, the browser cannot decode it, or the result is not smaller.
 */
export async function compressImage(file: File): Promise<File> {
  if (!isCompressible(file)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = targetSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff'; // JPEG has no alpha
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) return file;
    const result = new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
    return pickSmaller(file, result);
  } catch {
    return file;
  }
}
