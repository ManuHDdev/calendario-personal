import path from 'path';

export type Category = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'other';

export interface MimeInfo {
  mime: string;
  category: Category;
  /** Never rendered inline by the browser (could run script in our origin). */
  forceDownload?: boolean;
}

const TEXT = 'text/plain; charset=utf-8';

const TABLE: Record<string, MimeInfo> = {
  // images
  '.jpg': { mime: 'image/jpeg', category: 'image' },
  '.jpeg': { mime: 'image/jpeg', category: 'image' },
  '.png': { mime: 'image/png', category: 'image' },
  '.gif': { mime: 'image/gif', category: 'image' },
  '.webp': { mime: 'image/webp', category: 'image' },
  '.avif': { mime: 'image/avif', category: 'image' },
  '.bmp': { mime: 'image/bmp', category: 'image' },
  '.ico': { mime: 'image/x-icon', category: 'image' },
  // SVG can embed script: treat it as a download, not as an image.
  '.svg': { mime: 'image/svg+xml', category: 'other', forceDownload: true },
  // video
  '.mp4': { mime: 'video/mp4', category: 'video' },
  '.m4v': { mime: 'video/mp4', category: 'video' },
  '.webm': { mime: 'video/webm', category: 'video' },
  '.mov': { mime: 'video/quicktime', category: 'video' },
  '.mkv': { mime: 'video/x-matroska', category: 'video' },
  '.avi': { mime: 'video/x-msvideo', category: 'video' },
  '.ogv': { mime: 'video/ogg', category: 'video' },
  // audio
  '.mp3': { mime: 'audio/mpeg', category: 'audio' },
  '.m4a': { mime: 'audio/mp4', category: 'audio' },
  '.aac': { mime: 'audio/aac', category: 'audio' },
  '.wav': { mime: 'audio/wav', category: 'audio' },
  '.ogg': { mime: 'audio/ogg', category: 'audio' },
  '.oga': { mime: 'audio/ogg', category: 'audio' },
  '.opus': { mime: 'audio/ogg', category: 'audio' },
  '.flac': { mime: 'audio/flac', category: 'audio' },
  // documents
  '.pdf': { mime: 'application/pdf', category: 'pdf' },
  '.txt': { mime: TEXT, category: 'text' },
  '.log': { mime: TEXT, category: 'text' },
  '.md': { mime: TEXT, category: 'text' },
  '.csv': { mime: TEXT, category: 'text' },
  '.json': { mime: TEXT, category: 'text' },
  '.yml': { mime: TEXT, category: 'text' },
  '.yaml': { mime: TEXT, category: 'text' },
  // active content: never inline
  '.html': { mime: 'text/html', category: 'other', forceDownload: true },
  '.htm': { mime: 'text/html', category: 'other', forceDownload: true },
  '.xhtml': { mime: 'application/xhtml+xml', category: 'other', forceDownload: true },
  '.xml': { mime: 'application/xml', category: 'other', forceDownload: true },
  '.js': { mime: 'text/javascript', category: 'other', forceDownload: true },
  // archives & misc
  '.zip': { mime: 'application/zip', category: 'other' },
  '.gz': { mime: 'application/gzip', category: 'other' },
  '.tar': { mime: 'application/x-tar', category: 'other' },
  '.7z': { mime: 'application/x-7z-compressed', category: 'other' },
};

const FALLBACK: MimeInfo = { mime: 'application/octet-stream', category: 'other' };

export function getMimeInfo(fileName: string): MimeInfo {
  return TABLE[path.extname(fileName).toLowerCase()] ?? FALLBACK;
}
