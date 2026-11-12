import path from 'path';
import type { FastifyRequest } from 'fastify';
import { HttpError } from '../errors';
import type { MediaRow } from '../domain/types';
import { storeUpload, type MediaDeps } from '../services/mediaService';

export interface Rejected {
  filename: string;
  error: string;
  message: string;
  status: number;
}

export interface UploadOutcome {
  uploaded: MediaRow[];
  replaced: string[];
  rejected: Rejected[];
}

/**
 * Consumes the multipart parts of a request and stores each file through `storeUpload` (same MIME/size
 * validation, name sanitization and per-ASIN video lock for owners and guests). Per-file failures are
 * collected, not thrown. `guestLinkId` marks the files as guest uploads; `maxFiles` caps how many files
 * this request may still add (guest quota).
 */
export async function processUploads(
  deps: MediaDeps,
  request: FastifyRequest,
  asin: string,
  opts: { guestLinkId?: number; maxFiles?: number } = {},
): Promise<UploadOutcome> {
  const out: UploadOutcome = { uploaded: [], replaced: [], rejected: [] };
  for await (const part of request.parts()) {
    if (part.type !== 'file') continue;
    try {
      if (opts.maxFiles !== undefined && out.uploaded.length >= opts.maxFiles) {
        throw new HttpError(409, 'UploadLimitReached', 'Upload limit reached for this link');
      }
      const result = await storeUpload(deps, asin, {
        originalName: part.filename,
        mimetype: part.mimetype,
        stream: part.file,
        guestLinkId: opts.guestLinkId,
      });
      out.uploaded.push(result.media);
      out.replaced.push(...result.replaced);
    } catch (err) {
      part.file.resume();
      const e = err instanceof HttpError ? err : new HttpError(500, 'InternalError', 'Upload failed');
      if (!(err instanceof HttpError)) request.log.error({ err }, 'media upload failed');
      out.rejected.push({
        filename: path.basename(part.filename ?? '').slice(0, 120),
        error: e.code,
        message: e.message,
        status: e.statusCode,
      });
    }
  }
  return out;
}
