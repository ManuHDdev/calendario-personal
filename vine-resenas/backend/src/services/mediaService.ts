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
  /** Set when the upload comes through a guest link: it may never replace media it does not own. */
  guestLinkId?: number;
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

const PG_UNIQUE_VIOLATION = '23505';

// Per-ASIN promise chain: serializes the read-then-write video replacement so
// two concurrent uploads cannot both see "no previous video". Single backend
// instance only; the partial unique index is the cross-instance safety net.
const asinLocks = new Map<string, Promise<unknown>>();

async function withAsinLock<T>(asin: string, fn: () => Promise<T>): Promise<T> {
  const prev = asinLocks.get(asin) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined);
  asinLocks.set(asin, tail);
  try {
    return await run;
  } finally {
    if (asinLocks.get(asin) === tail) asinLocks.delete(asin);
  }
}

/**
 * Validates, stores and registers one upload. A product holds at most one
 * video (enforced by a partial unique index): the new file is written first,
 * then, under a per-ASIN lock, the old video rows are swapped for the new one
 * and only afterwards are the old files removed. If registering the new row
 * fails the old rows are put back, so the product never loses its video.
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

  const size = await store.save(asin, filename, upload.stream, maxBytesFor(info.type));
  const row = { asin, filename, type: info.type, size, guestLinkId: upload.guestLinkId ?? null };

  const register = async (): Promise<StoreResult> => {
    // Read inside the lock: the product may have gained a video while the file was streaming.
    const previous =
      info.type === 'video' ? ((await repo.get(asin))?.media ?? []).filter((m) => m.type === 'video') : [];
    // A guest may only replace a video that came from its own link, never the owner's (or another guest's).
    if (upload.guestLinkId !== undefined && previous.some((m) => m.uploaded_via_guest_link_id !== upload.guestLinkId)) {
      throw new HttpError(409, 'VideoExists', 'The product already has a video');
    }
    for (const old of previous) await repo.deleteMedia(asin, old.filename);
    let media: MediaRow;
    try {
      media = await repo.addMedia(row);
    } catch (err) {
      for (const old of previous) {
        await repo
          .addMedia({
            asin,
            filename: old.filename,
            type: old.type,
            size: old.size,
            guestLinkId: old.uploaded_via_guest_link_id,
          })
          .catch(() => undefined);
      }
      throw err;
    }
    for (const old of previous) await store.remove(asin, old.filename).catch(() => undefined);
    return { media, replaced: previous.map((m) => m.filename) };
  };

  try {
    return info.type === 'video' ? await withAsinLock(asin, register) : await register();
  } catch (err) {
    await store.remove(asin, filename).catch(() => undefined);
    if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION && info.type === 'video') {
      throw new HttpError(409, 'Conflict', 'The product already has a video (concurrent upload); try again');
    }
    throw err;
  }
}

/** Removes the row and then the file. Returns false when the media did not exist. */
export async function removeMedia(deps: MediaDeps, asin: string, filename: string): Promise<boolean> {
  const existed = await deps.repo.deleteMedia(asin, filename);
  if (existed) await deps.store.remove(asin, filename).catch(() => undefined);
  return existed;
}
