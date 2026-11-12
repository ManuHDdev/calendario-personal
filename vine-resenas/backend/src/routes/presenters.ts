import type { GuestLink, GuestLinkStatus, MediaRow, Product, ProductWithMedia } from '../domain/types';

export const API_PREFIX = '/vine-resenas/api';
export const UI_BASE = `${API_PREFIX}/ui`;
export const V1_BASE = `${API_PREFIX}/v1`;
export const GUEST_BASE = `${API_PREFIX}/guest`;
/** SPA page a relative opens (served by the frontend, not the API). */
export const GUEST_PAGE_BASE = '/vine-resenas/c';

export function mediaUrl(base: string, asin: string, filename: string): string {
  return `${base}/media/${asin}/${filename}`;
}

export function presentMedia(m: MediaRow, base: string) {
  return {
    id: m.id,
    filename: m.filename,
    type: m.type,
    size: m.size,
    created_at: m.created_at,
    uploaded_by_guest: m.uploaded_via_guest_link_id != null,
    url: mediaUrl(base, m.asin, m.filename),
  };
}

/** Owner-side view of a guest link. Never carries the token (only its hash is stored). */
export function presentGuestLinkAdmin(l: GuestLink, status: GuestLinkStatus) {
  return {
    id: l.id,
    createdAt: l.created_at,
    expiresAt: l.expires_at,
    revokedAt: l.revoked_at,
    lastUsedAt: l.last_used_at,
    status,
  };
}

/** Full product: every field plus the media list (absolute-path URLs under `base`). */
export function presentProduct(p: ProductWithMedia, base: string) {
  const { media, ...fields } = p;
  return { ...fields, media: media.map((m) => presentMedia(m, base)) };
}

/** Product row without media, as returned by write endpoints. */
export function presentBare(p: Product) {
  return { ...p };
}

/** Compact row for the UI list. */
export function presentSummary(p: ProductWithMedia, base: string) {
  const photos = p.media.filter((m) => m.type === 'photo');
  return {
    asin: p.asin,
    titulo: p.titulo,
    estado: p.estado,
    estrellas: p.estrellas,
    has_feedback: p.feedback.trim() !== '',
    photo_count: photos.length,
    has_video: p.media.some((m) => m.type === 'video'),
    thumbnail_url: photos[0] ? mediaUrl(base, p.asin, photos[0].filename) : null,
    updated_at: p.updated_at,
  };
}

/** Parses a single `Range: bytes=a-b` header. null = no/ignored range, 'invalid' = unsatisfiable. */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | 'invalid' | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    const suffix = Number(m[2]);
    if (suffix === 0) return 'invalid';
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}
