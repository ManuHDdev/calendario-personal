import { createReadStream } from 'fs';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import path from 'path';
import { authMiddleware } from '../middleware/auth';
import { listDirectory } from '../services/listing';
import { getMimeInfo } from '../services/mime';
import { PathError, resolveSafePath } from '../services/pathSafety';
import { parseRange } from '../services/range';
import { ThumbError, ThumbnailService, isThumbnailable, parseThumbWidth } from '../services/thumbnail';

// Read-only app: both delegated roles may view everything. `familia` and
// `invitado` are deliberately excluded because these files are private.
export const ALLOWED_ROLES = ['admin', 'descargas_admin', 'descargas_invitado'];

export interface DescargasRoutesOptions {
  /** Folder served (mounted read-only). Defaults to DOWNLOADS_ROOT or /data. */
  root?: string;
  /** Writable folder for generated thumbnails. Defaults to THUMB_CACHE_DIR or a tmp dir. */
  thumbCacheDir?: string;
}

interface PathQuery {
  path?: unknown;
}

/** `attachment; filename="ascii"; filename*=UTF-8''percent-encoded` (RFC 6266 / 5987). */
function contentDisposition(kind: 'inline' | 'attachment', fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function sendPathError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof PathError) return reply.code(err.statusCode).send({ error: err.message });
  throw err;
}

export async function descargasRoutes(
  app: FastifyInstance,
  opts: DescargasRoutesOptions = {},
): Promise<void> {
  const root = opts.root ?? process.env.DOWNLOADS_ROOT ?? '/data';

  const thumbs = new ThumbnailService(opts.thumbCacheDir ?? ThumbnailService.defaultCacheDir());

  const guard = authMiddleware(ALLOWED_ROLES);
  // <img>/<video>/<a download> cannot send headers, so only the byte-serving
  // routes also take the token as `?token=` (same pattern as storage).
  const mediaGuard = authMiddleware(ALLOWED_ROLES, { allowQueryToken: true });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/list', { preHandler: guard }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const resolved = await resolveSafePath(root, (request.query as PathQuery).path);
      if (!resolved.stat.isDirectory()) return reply.code(400).send({ error: 'Not a directory' });
      const entries = await listDirectory(resolved.realRoot, resolved.absolute, resolved.relative);
      return { path: resolved.relative, entries };
    } catch (err) {
      return sendPathError(reply, err);
    }
  });

  async function serveFile(request: FastifyRequest, reply: FastifyReply, asDownload: boolean) {
    try {
      const resolved = await resolveSafePath(root, (request.query as PathQuery).path);
      if (!resolved.stat.isFile()) return reply.code(400).send({ error: 'Not a file' });

      const size = resolved.stat.size;
      const name = path.basename(resolved.absolute);
      // Name shown to the user comes from the requested path, not the symlink target.
      const displayName = resolved.relative ? path.posix.basename(resolved.relative) : name;
      const info = getMimeInfo(displayName);
      const attachment = asDownload || info.forceDownload === true;

      const range = parseRange(request.headers.range, size);
      if (range.kind === 'unsatisfiable') {
        return reply
          .code(416)
          .header('Content-Range', `bytes */${size}`)
          .send({ error: 'Range not satisfiable' });
      }

      reply
        .header('Accept-Ranges', 'bytes')
        .header('Content-Type', info.forceDownload ? 'application/octet-stream' : info.mime)
        .header('Content-Disposition', contentDisposition(attachment ? 'attachment' : 'inline', displayName))
        .header('Last-Modified', resolved.stat.mtime.toUTCString())
        .header('Cache-Control', 'private, max-age=300')
        // The files are untrusted: never let the browser sniff or run them.
        .header('X-Content-Type-Options', 'nosniff');
      // CSP sandbox would block Chrome's built-in PDF viewer, so PDFs skip it.
      if (info.category !== 'pdf') reply.header('Content-Security-Policy', "sandbox; default-src 'none'");

      if (range.kind === 'partial') {
        const length = range.end - range.start + 1;
        return reply
          .code(206)
          .header('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
          .header('Content-Length', length)
          .send(createReadStream(resolved.absolute, { start: range.start, end: range.end }));
      }

      return reply.code(200).header('Content-Length', size).send(createReadStream(resolved.absolute));
    } catch (err) {
      return sendPathError(reply, err);
    }
  }

  // Grid thumbnails: WebP, EXIF-rotated, whitelisted widths, cached on disk
  // (the media root itself is read-only).
  app.get('/thumb', { preHandler: mediaGuard }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as PathQuery & { w?: unknown };
      const width = parseThumbWidth(query.w);
      const resolved = await resolveSafePath(root, query.path);
      if (!resolved.stat.isFile()) return reply.code(400).send({ error: 'Not a file' });
      if (!isThumbnailable(resolved.relative)) {
        return reply.code(415).send({ error: 'Unsupported image format' });
      }

      const source = { absolute: resolved.absolute, size: resolved.stat.size, mtimeMs: resolved.stat.mtimeMs };
      // The key already encodes file identity + width, so it doubles as the ETag
      // and a revalidation never needs to decode (or even read) anything.
      const etag = `"${thumbs.keyFor(source, width)}"`;
      // Cache headers are only attached to successes, never to error responses.
      const cacheHeaders = { ETag: etag, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' };
      if (request.headers['if-none-match'] === etag) return reply.code(304).headers(cacheHeaders).send();

      const data = await thumbs.get(source, width);
      return reply
        .code(200)
        .headers(cacheHeaders)
        .header('Content-Type', 'image/webp')
        .header('Content-Length', data.length)
        .header('Content-Disposition', 'inline')
        .header('Content-Security-Policy', "sandbox; default-src 'none'")
        .send(data);
    } catch (err) {
      if (err instanceof ThumbError) return reply.code(err.statusCode).send({ error: err.message });
      return sendPathError(reply, err);
    }
  });

  app.get('/file', { preHandler: mediaGuard }, (request, reply) => serveFile(request, reply, false));
  app.get('/download', { preHandler: mediaGuard }, (request, reply) => serveFile(request, reply, true));
}
