import keycloak from './keycloak';

const BASE = '/ytdl/api';

export type DownloadFormat = 'mp4' | 'mp3';

const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
]);

/**
 * Validación en cliente que espeja la allowlist del backend
 * (ver ytdl/backend/src/services/validation.ts). Es solo feedback rápido en
 * la UI — la validación que realmente importa se hace en el servidor.
 */
export function isAllowedYoutubeUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return ALLOWED_HOSTS.has(parsed.hostname.toLowerCase());
}

/**
 * Construye la URL de descarga con el JWT como query param `?token=`
 * (mismo fallback que Storage usa para <img>/<video>/<iframe> — aquí se usa
 * porque disparamos la descarga navegando a un enlace, no vía fetch).
 */
export function buildDownloadUrl(url: string, format: DownloadFormat): string {
  const token = keycloak.token ?? '';
  const params = new URLSearchParams({ url, format, token });
  return `${BASE}/download?${params.toString()}`;
}
