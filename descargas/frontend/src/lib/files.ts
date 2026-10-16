export type Category = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'other';

export interface DirEntry {
  name: string;
  path: string;
  type: 'dir' | 'file';
  size: number;
  mtime: string;
  mime: string | null;
  category: Category | null;
}

export type SortKey = 'date' | 'name' | 'size';
export type SortDir = 'asc' | 'desc';
export type CategoryFilter = 'all' | Category;

export interface Breadcrumb {
  label: string;
  /** Root-relative path this crumb navigates to ('' = root). */
  path: string;
}

/** Strips accents and case so "camion" finds "Camión.JPG". */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filterEntries(
  entries: DirEntry[],
  query: string,
  category: CategoryFilter = 'all',
): DirEntry[] {
  const q = normalize(query.trim());
  return entries.filter((e) => {
    if (q && !normalize(e.name).includes(q)) return false;
    // Folders stay visible under a category filter so navigation never breaks.
    if (category !== 'all' && e.type === 'file' && e.category !== category) return false;
    return true;
  });
}

/** Folders always come first; `key`/`dir` order each group. Does not mutate. */
export function sortEntries(entries: DirEntry[], key: SortKey, dir: SortDir): DirEntry[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    let cmp = 0;
    if (key === 'name') cmp = a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' });
    else if (key === 'size') cmp = a.size - b.size;
    else cmp = Date.parse(a.mtime) - Date.parse(b.mtime);
    if (cmp !== 0) return cmp * sign;
    // Stable, direction-independent tiebreak.
    return a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' });
  });
}

export function buildBreadcrumbs(path: string): Breadcrumb[] {
  const crumbs: Breadcrumb[] = [{ label: 'Inicio', path: '' }];
  let acc = '';
  for (const segment of path.split('/').filter(Boolean)) {
    acc = acc ? `${acc}/${segment}` : segment;
    crumbs.push({ label: segment, path: acc });
  }
  return crumbs;
}

export function parentPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[i]}`.replace('.', ',');
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Files the lightbox can step through, in the order shown on screen. */
export function imagesOf(entries: DirEntry[]): DirEntry[] {
  return entries.filter((e) => e.type === 'file' && e.category === 'image');
}
