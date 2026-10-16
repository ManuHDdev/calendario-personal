import { promises as fs } from 'fs';
import path from 'path';
import { PathError, isInside, parseRelativePath } from './pathSafety';

/** Upper bound of paths accepted in one request. */
export const MAX_DELETE_PATHS = 200;

export interface DeleteFailure {
  path: string;
  error: string;
}

export interface DeleteResult {
  deleted: string[];
  failed: DeleteFailure[];
}

/** A whole-request problem (HTTP 400) detected before anything is removed. */
export class DeleteRequestError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'DeleteRequestError';
  }
}

/**
 * Validates the request body and returns the unique, normalised root-relative
 * paths (segments joined with `/`). Everything is checked up front so an invalid
 * entry rejects the whole request before a single file is touched.
 */
export function parseDeleteBody(body: unknown): string[] {
  const paths = (body as { paths?: unknown } | null | undefined)?.paths;
  if (!Array.isArray(paths)) throw new DeleteRequestError('"paths" must be an array');
  if (paths.length === 0) throw new DeleteRequestError('"paths" must not be empty');
  if (paths.length > MAX_DELETE_PATHS) {
    throw new DeleteRequestError(`At most ${MAX_DELETE_PATHS} paths per request`);
  }

  const unique = new Set<string>();
  for (const entry of paths) {
    if (typeof entry !== 'string') throw new DeleteRequestError('Every path must be a string');
    let segments: string[];
    try {
      segments = parseRelativePath(entry);
    } catch (err) {
      if (err instanceof PathError) throw new DeleteRequestError(err.message);
      throw err;
    }
    // The root itself (''/'.'/'/') can never be deleted.
    if (segments.length === 0) throw new DeleteRequestError('The root folder cannot be deleted');
    unique.add(segments.join('/'));
  }
  return [...unique];
}

/** Maps a filesystem error to a message that never exposes host paths. */
function describeError(err: unknown): string {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  switch (code) {
    case 'ENOENT':
    case 'ENOTDIR':
      return 'Not found';
    case 'EACCES':
    case 'EPERM':
    case 'EROFS':
      return 'Permission denied';
    case 'EBUSY':
      return 'Resource busy';
    default:
      return 'Delete failed';
  }
}

class NotFound extends Error {}

/**
 * Removes one entry. The parent directory is resolved with realpath (and must
 * stay inside the root) but the LAST segment is never followed: a symlink is
 * unlinked itself, a real directory is removed recursively (fs.rm never follows
 * symlinks it finds inside). Returns whether a real directory was removed.
 */
async function removeEntry(realRoot: string, segments: string[]): Promise<{ wasDir: boolean }> {
  const name = segments[segments.length - 1];
  let realParent: string;
  try {
    realParent = await fs.realpath(path.join(realRoot, ...segments.slice(0, -1)));
  } catch {
    throw new NotFound();
  }
  // A symlinked ancestor pointing outside the root must not let us reach outside it.
  if (!isInside(realRoot, realParent)) throw new NotFound();

  const target = path.join(realParent, name);
  const stat = await fs.lstat(target); // lstat: do not follow the final component
  if (stat.isSymbolicLink()) {
    await fs.unlink(target);
    return { wasDir: false };
  }
  if (stat.isDirectory()) {
    await fs.rm(target, { recursive: true, force: false });
    return { wasDir: true };
  }
  await fs.unlink(target);
  return { wasDir: false };
}

/**
 * Deletes every path (already validated by `parseDeleteBody`). Partial success is
 * allowed: a failure on one entry never aborts the rest. Entries that live below
 * a folder removed earlier in the same request are reported as deleted.
 */
export async function deletePaths(
  root: string,
  paths: string[],
  onDeleted?: (relativePath: string) => void,
  onFailed?: (relativePath: string, error: string) => void,
): Promise<DeleteResult> {
  const result: DeleteResult = { deleted: [], failed: [] };

  let realRoot: string;
  try {
    realRoot = await fs.realpath(root);
  } catch {
    for (const p of paths) {
      result.failed.push({ path: p, error: 'Root folder not available' });
      onFailed?.(p, 'Root folder not available');
    }
    return result;
  }

  // Shallow paths first so folders are handled before their descendants.
  const ordered = [...paths].sort((a, b) => a.split('/').length - b.split('/').length);
  const removedDirs: string[] = [];

  for (const rel of ordered) {
    if (removedDirs.some((dir) => rel.startsWith(`${dir}/`))) {
      result.deleted.push(rel);
      continue;
    }
    try {
      const { wasDir } = await removeEntry(realRoot, rel.split('/'));
      if (wasDir) removedDirs.push(rel);
      result.deleted.push(rel);
      onDeleted?.(rel);
    } catch (err) {
      const message = err instanceof NotFound ? 'Not found' : describeError(err);
      result.failed.push({ path: rel, error: message });
      onFailed?.(rel, message);
    }
  }
  return result;
}
