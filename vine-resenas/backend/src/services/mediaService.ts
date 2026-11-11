import type { Readable } from 'stream';
import { HttpError } from '../errors';
import type { ProductRepository } from '../db/repository';
import type { MediaRow } from '../domain/types';
import { classifyUpload, generateFilename, maxBytesFor } from '../domain/validation';
import type { FileStore } from './fileStore';

export interface UploadInput {
  originalName: string;
  mimetype: string;
  stream: Readable;
}

export interface StoreResult {
  media: MediaRow;
  /** Filenames of the previous video removed because this upload replaced it. */
  replaced: string[];
}

export interface MediaDeps {
  repo: ProductRepository;
  store: FileStore;
  now?: () => number;
  rand?: () => string;
}

/**
 * Validates, stores and registers one upload. A product holds at most one
 * video: a new video is committed first, then the previous one (row + file)
 * is removed, so a failure never leaves the product without its video.
 */
export async function storeUpload(deps: MediaDeps, asin: string, upload: UploadInput): Promise<StoreResult> {
  const { repo, store } = deps;
  const info = classifyUpload(upload.originalName, upload.mimetype);
  const filename = generateFilename(info.ext, deps.now?.(), deps.rand?.());

  const product = await repo.get(asin);
  if (!product) {
    upload.stream.resume();
    throw new HttpError(404, 'NotFound', `Product ${asin} not found`);
  }
  const previousVideos = info.type === 'video' ? product.media.filter((m) => m.type === 'video') : [];

  const size = await store.save(asin, filename, upload.stream, maxBytesFor(info.type));

  let media: MediaRow;
  try {
    media = await repo.addMedia({ asin, filename, type: info.type, size });
  } catch (err) {
    await store.remove(asin, filename).catch(() => undefined);
    throw err;
  }

  const replaced: string[] = [];
  for (const old of previousVideos) {
    await repo.deleteMedia(asin, old.filename);
    await store.remove(asin, old.filename).catch(() => undefined);
    replaced.push(old.filename);
  }
  return { media, replaced };
}

/** Removes the row and then the file. Returns false when the media did not exist. */
export async function removeMedia(deps: MediaDeps, asin: string, filename: string): Promise<boolean> {
  const existed = await deps.repo.deleteMedia(asin, filename);
  if (existed) await deps.store.remove(asin, filename).catch(() => undefined);
  return existed;
}
