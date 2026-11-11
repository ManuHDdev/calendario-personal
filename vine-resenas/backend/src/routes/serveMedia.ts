import path from 'path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { HttpError } from '../errors';
import { mimeForExtension, parseAsin, parseStoredFilename } from '../domain/validation';
import type { AppDeps } from './deps';
import { parseRange } from './presenters';

/** Streams a media file with Range support (needed for video seeking). Shared by the UI and v1 routes. */
export async function serveMedia(
  deps: AppDeps,
  request: FastifyRequest,
  reply: FastifyReply,
  rawAsin: unknown,
  rawFilename: unknown,
): Promise<FastifyReply> {
  const asin = parseAsin(rawAsin);
  const filename = parseStoredFilename(rawFilename);
  const row = await deps.repo.getMedia(asin, filename);
  if (!row) throw new HttpError(404, 'NotFound', 'Media not found');

  let size: number;
  try {
    size = (await deps.store.stat(asin, filename)).size;
  } catch {
    throw new HttpError(404, 'NotFound', 'Media file is missing on disk');
  }

  const mime = mimeForExtension(path.extname(filename)) ?? 'application/octet-stream';
  reply
    .header('Content-Type', mime)
    .header('Accept-Ranges', 'bytes')
    .header('X-Content-Type-Options', 'nosniff')
    .header('Cache-Control', 'private, max-age=3600');

  const range = parseRange(request.headers.range, size);
  if (range === 'invalid') {
    return reply.code(416).header('Content-Range', `bytes */${size}`).send();
  }
  if (range) {
    reply
      .code(206)
      .header('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
      .header('Content-Length', range.end - range.start + 1);
    return reply.send(deps.store.open(asin, filename, range));
  }
  reply.header('Content-Length', size);
  return reply.send(deps.store.open(asin, filename));
}
