import { promises as fs } from 'fs';
import path from 'path';
import { getMimeInfo, type Category } from './mime';
import { isInside } from './pathSafety';

export interface DirEntry {
  name: string;
  /** Root-relative path using `/`. */
  path: string;
  type: 'dir' | 'file';
  size: number;
  mtime: string;
  mime: string | null;
  category: Category | null;
}

/** Directories first, then newest first; name breaks ties for a stable order. */
export function compareEntries(a: DirEntry, b: DirEntry): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
  const byTime = Date.parse(b.mtime) - Date.parse(a.mtime);
  if (byTime !== 0) return byTime;
  return a.name.localeCompare(b.name);
}

/**
 * Lists `absoluteDir` (already realpath'ed and proven inside `realRoot`).
 * Hidden files, broken symlinks and symlinks leading outside the root are
 * silently skipped.
 */
export async function listDirectory(
  realRoot: string,
  absoluteDir: string,
  relativeDir: string,
): Promise<DirEntry[]> {
  const names = await fs.readdir(absoluteDir);
  const entries: DirEntry[] = [];

  await Promise.all(
    names.map(async (name) => {
      if (name.startsWith('.')) return;
      try {
        const real = await fs.realpath(path.join(absoluteDir, name));
        if (!isInside(realRoot, real)) return;
        const stat = await fs.stat(real);
        const isDir = stat.isDirectory();
        if (!isDir && !stat.isFile()) return;
        const info = isDir ? null : getMimeInfo(name);
        entries.push({
          name,
          path: relativeDir ? `${relativeDir}/${name}` : name,
          type: isDir ? 'dir' : 'file',
          size: isDir ? 0 : stat.size,
          mtime: stat.mtime.toISOString(),
          mime: info ? info.mime.split(';')[0] : null,
          category: info ? info.category : null,
        });
      } catch {
        /* broken link or race with a deletion: skip */
      }
    }),
  );

  return entries.sort(compareEntries);
}
