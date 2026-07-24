// Validación pura (sin efectos secundarios) para la ruta de descarga.
// Se mantiene separada de la ruta para poder testearla sin levantar Fastify
// ni invocar yt-dlp.

const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
]);

/**
 * Comprueba que la URL sea http(s) y que su host esté en la allowlist de YouTube.
 * Debe llamarse ANTES de invocar cualquier child process.
 */
export function isAllowedYoutubeUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  return ALLOWED_HOSTS.has(parsed.hostname.toLowerCase());
}

export type DownloadFormat = 'mp4' | 'mp3';

export function isValidFormat(format: unknown): format is DownloadFormat {
  return format === 'mp4' || format === 'mp3';
}

const CONTENT_TYPE_BY_FORMAT: Record<DownloadFormat, string> = {
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
};

export function contentTypeFor(format: DownloadFormat): string {
  return CONTENT_TYPE_BY_FORMAT[format];
}

/**
 * Elimina barras, backslashes y caracteres de control del título para que
 * pueda usarse de forma segura dentro de un header Content-Disposition.
 */
export function sanitizeFilename(title: string): string {
  const cleaned = title
    .replace(/[/\\]/g, '_')
    .replace(/[\x00-\x1f\x7f"]/g, '')
    .trim();
  return cleaned.length > 0 ? cleaned : 'video';
}

export function buildFilename(title: string, format: DownloadFormat): string {
  return `${sanitizeFilename(title)}.${format}`;
}

/**
 * Construye el valor completo del header Content-Disposition para `filename`.
 * El parámetro `filename=` clásico solo admite ISO-8859-1 (RFC 6266): un
 * título con tildes/ñ/emoji/CJK se corrompería o rompería la respuesta si se
 * escribiera tal cual. Se añade además `filename*=UTF-8''...` (RFC 5987), que
 * todos los navegadores modernos prefieren y que sí soporta Unicode completo;
 * el `filename=` clásico queda como fallback ASCII para clientes antiguos.
 */
export function contentDispositionFor(filename: string): string {
  // eslint-disable-next-line no-control-regex
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
