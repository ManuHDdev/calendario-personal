import type { DirEntry } from './files';

/** Roles that may delete. The backend is the real enforcement; this only hides the UI. */
export const DELETE_ROLES = ['admin', 'descargas_admin'] as const;

export function canDelete(roles: readonly string[] | undefined | null): boolean {
  return !!roles && DELETE_ROLES.some((r) => roles.includes(r));
}

/** Returns a NEW set with `path` added or removed (never mutates). */
export function toggleSelection(selected: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(selected);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  return next;
}

export function selectAll(entries: readonly DirEntry[]): Set<string> {
  return new Set(entries.map((e) => e.path));
}

/** True when there is something visible and every visible entry is selected. */
export function allSelected(visible: readonly DirEntry[], selected: ReadonlySet<string>): boolean {
  return visible.length > 0 && visible.every((e) => selected.has(e.path));
}

/** Drops selected paths that no longer exist in the listing. */
export function pruneSelection(selected: ReadonlySet<string>, entries: readonly DirEntry[]): Set<string> {
  const existing = new Set(entries.map((e) => e.path));
  return new Set([...selected].filter((p) => existing.has(p)));
}

/** Selected entries, in listing order. */
export function selectedEntries(entries: readonly DirEntry[], selected: ReadonlySet<string>): DirEntry[] {
  return entries.filter((e) => selected.has(e.path));
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const CONFIRM_PREVIEW_LIMIT = 5;

export interface ConfirmSummary {
  title: string;
  /** Names of the first few items, folders marked with a trailing slash. */
  names: string[];
  /** How many more items are not listed in `names`. */
  more: number;
  hasFolders: boolean;
}

/** Texts for the irreversible-delete confirmation modal (Spanish UI copy). */
export function summarizeForConfirm(entries: readonly DirEntry[]): ConfirmSummary {
  const dirs = entries.filter((e) => e.type === 'dir').length;
  const files = entries.length - dirs;
  let title: string;
  if (entries.length === 1) {
    title = dirs === 1 ? '¿Eliminar esta carpeta?' : '¿Eliminar este archivo?';
  } else if (dirs === 0) {
    title = `¿Eliminar ${plural(files, 'archivo', 'archivos')}?`;
  } else if (files === 0) {
    title = `¿Eliminar ${plural(dirs, 'carpeta', 'carpetas')}?`;
  } else {
    title = `¿Eliminar ${plural(files, 'archivo', 'archivos')} y ${plural(dirs, 'carpeta', 'carpetas')}?`;
  }
  return {
    title,
    names: entries.slice(0, CONFIRM_PREVIEW_LIMIT).map((e) => (e.type === 'dir' ? `${e.name}/` : e.name)),
    more: Math.max(0, entries.length - CONFIRM_PREVIEW_LIMIT),
    hasFolders: dirs > 0,
  };
}

/** Backend error codes (English, no host paths) -> Spanish text for the user. */
export function failureMessage(error: string): string {
  switch (error) {
    case 'Not found':
      return 'Ya no existe';
    case 'Permission denied':
      return 'Sin permisos en el servidor';
    case 'Resource busy':
      return 'Está en uso';
    default:
      return 'No se pudo eliminar';
  }
}

/**
 * Where the lightbox should go after deleting: the next image that survives
 * (looking forward first, then backward), or null when none is left.
 */
export function nextImageAfterDeletion(
  images: readonly DirEntry[],
  currentPath: string,
  deleted: ReadonlySet<string>,
): string | null {
  const index = images.findIndex((i) => i.path === currentPath);
  if (index < 0) return null;
  for (let i = index + 1; i < images.length; i++) if (!deleted.has(images[i].path)) return images[i].path;
  for (let i = index - 1; i >= 0; i--) if (!deleted.has(images[i].path)) return images[i].path;
  return null;
}

/** Removes deleted paths (and anything below a deleted folder) from a listing. */
export function withoutDeleted(entries: readonly DirEntry[], deleted: readonly string[]): DirEntry[] {
  const gone = new Set(deleted);
  return entries.filter((e) => !gone.has(e.path) && !deleted.some((d) => e.path.startsWith(`${d}/`)));
}
