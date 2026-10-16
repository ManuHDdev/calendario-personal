import { promises as fs, type Stats } from 'fs';
import path from 'path';

export class PathError extends Error {
  constructor(
    public readonly statusCode: 400 | 404,
    message: string,
  ) {
    super(message);
    this.name = 'PathError';
  }
}

/**
 * Lexical validation of a user-supplied relative path. Rejects everything that
 * could address something outside the root BEFORE touching the filesystem:
 * null bytes, absolute paths (POSIX, Windows drive letters, UNC), backslashes
 * and any `..` segment. Returns the normalised segments (empty = the root).
 */
export function parseRelativePath(input: unknown): string[] {
  if (input === undefined || input === null || input === '') return [];
  if (typeof input !== 'string') throw new PathError(400, 'Invalid path');
  if (input.includes('\0')) throw new PathError(400, 'Invalid path');
  if (input.length > 4096) throw new PathError(400, 'Invalid path');
  if (input.startsWith('/') || input.startsWith('\\') || /^[a-zA-Z]:/.test(input)) {
    throw new PathError(400, 'Absolute paths are not allowed');
  }
  if (input.includes('\\')) throw new PathError(400, 'Invalid path');

  const segments: string[] = [];
  for (const segment of input.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') throw new PathError(400, 'Path traversal is not allowed');
    segments.push(segment);
  }
  return segments;
}

export interface ResolvedPath {
  /** Real (symlink-resolved) absolute path, guaranteed to live inside the root. */
  absolute: string;
  /** Real absolute path of the root. */
  realRoot: string;
  /** Normalised root-relative path using `/`, '' for the root itself. */
  relative: string;
  stat: Stats;
}

/** True when `candidate` is `root` or lives below it (both already realpath'ed). */
export function isInside(root: string, candidate: string): boolean {
  if (candidate === root) return true;
  const withSep = root.endsWith(path.sep) ? root : root + path.sep;
  return candidate.startsWith(withSep);
}

/**
 * Resolves a user path against `root` and proves, via realpath, that the final
 * target (after following every symlink) is still inside the root. A symlink
 * pointing outside is reported as 404, not 403, so existence outside the root
 * is not disclosed.
 */
export async function resolveSafePath(root: string, input: unknown): Promise<ResolvedPath> {
  const segments = parseRelativePath(input);

  let realRoot: string;
  try {
    realRoot = await fs.realpath(root);
  } catch {
    throw new PathError(404, 'Root folder not available');
  }

  const candidate = path.join(realRoot, ...segments);
  let real: string;
  try {
    real = await fs.realpath(candidate);
  } catch {
    throw new PathError(404, 'Not found');
  }
  if (!isInside(realRoot, real)) throw new PathError(404, 'Not found');

  const stat = await fs.stat(real);
  return { absolute: real, realRoot, relative: segments.join('/'), stat };
}
