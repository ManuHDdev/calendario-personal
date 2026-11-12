export const PHOTO_MAX_BYTES = 25 * 1024 * 1024; // 25 MB (mirror of the backend)
export const VIDEO_MAX_BYTES = 1024 * 1024 * 1024; // 1 GB (mirror of the backend)

export const PHOTO_LIMIT_LABEL = '25 MB';
export const VIDEO_LIMIT_LABEL = '1 GB';

type FileLike = { type: string; name?: string };

export function isVideo(file: FileLike): boolean {
  return file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name ?? '');
}

/** Spanish message when the file exceeds its limit (video 1 GB, photo 25 MB). */
export function tooLargeMessage(file: FileLike): string {
  return isVideo(file)
    ? `El vídeo supera el límite de ${VIDEO_LIMIT_LABEL}`
    : `La foto supera el límite de ${PHOTO_LIMIT_LABEL}`;
}

/** Returns an error message when `file` is over its limit, otherwise null. */
export function checkFileSize(file: FileLike & { size: number }): string | null {
  const max = isVideo(file) ? VIDEO_MAX_BYTES : PHOTO_MAX_BYTES;
  return file.size > max ? tooLargeMessage(file) : null;
}
