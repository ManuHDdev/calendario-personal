import { describe, expect, it } from 'vitest';
import {
  allSelected,
  canDelete,
  failureMessage,
  nextImageAfterDeletion,
  pruneSelection,
  selectAll,
  selectedEntries,
  summarizeForConfirm,
  toggleSelection,
  withoutDeleted,
} from './deletion';
import type { DirEntry } from './files';

const file = (name: string, dir = ''): DirEntry => ({
  name,
  path: dir ? `${dir}/${name}` : name,
  type: 'file',
  size: 1,
  mtime: '2026-01-01T00:00:00Z',
  mime: 'image/jpeg',
  category: 'image',
});
const folder = (name: string): DirEntry => ({ ...file(name), type: 'dir', mime: null, category: null });

describe('canDelete', () => {
  it('allows admin and descargas_admin only', () => {
    expect(canDelete(['admin'])).toBe(true);
    expect(canDelete(['descargas_admin'])).toBe(true);
    expect(canDelete(['descargas_invitado'])).toBe(false);
    expect(canDelete(['familia', 'invitado'])).toBe(false);
    expect(canDelete([])).toBe(false);
    expect(canDelete(undefined)).toBe(false);
  });
});

describe('selection', () => {
  const a = file('a.jpg');
  const b = file('b.jpg');
  const c = folder('c');

  it('toggles without mutating the previous set', () => {
    const empty = new Set<string>();
    const one = toggleSelection(empty, 'a.jpg');
    expect([...empty]).toEqual([]);
    expect([...one]).toEqual(['a.jpg']);
    expect([...toggleSelection(one, 'a.jpg')]).toEqual([]);
  });

  it('selects all visible entries and detects a full selection', () => {
    const all = selectAll([a, b, c]);
    expect(all.size).toBe(3);
    expect(allSelected([a, b, c], all)).toBe(true);
    expect(allSelected([a, b, c], toggleSelection(all, 'b.jpg'))).toBe(false);
    expect(allSelected([], new Set())).toBe(false);
  });

  it('returns selected entries in listing order and prunes vanished ones', () => {
    const sel = new Set(['c', 'a.jpg', 'gone.jpg']);
    expect(selectedEntries([a, b, c], sel).map((e) => e.name)).toEqual(['a.jpg', 'c']);
    expect([...pruneSelection(sel, [a, b, c])].sort()).toEqual(['a.jpg', 'c']);
  });
});

describe('summarizeForConfirm', () => {
  it('words singular file and folder', () => {
    expect(summarizeForConfirm([file('a.jpg')]).title).toBe('¿Eliminar este archivo?');
    expect(summarizeForConfirm([folder('x')]).title).toBe('¿Eliminar esta carpeta?');
    expect(summarizeForConfirm([folder('x')]).hasFolders).toBe(true);
  });

  it('counts files and folders', () => {
    expect(summarizeForConfirm([file('a'), file('b')]).title).toBe('¿Eliminar 2 archivos?');
    expect(summarizeForConfirm([folder('x'), folder('y')]).title).toBe('¿Eliminar 2 carpetas?');
    expect(summarizeForConfirm([file('a'), folder('x')]).title).toBe('¿Eliminar 1 archivo y 1 carpeta?');
  });

  it('lists only the first names, marks folders and counts the rest', () => {
    const entries = [folder('docs'), ...Array.from({ length: 7 }, (_, i) => file(`f${i}.jpg`))];
    const s = summarizeForConfirm(entries);
    expect(s.names).toHaveLength(5);
    expect(s.names[0]).toBe('docs/');
    expect(s.more).toBe(3);
  });
});

describe('failureMessage', () => {
  it('translates known backend errors and falls back for the rest', () => {
    expect(failureMessage('Not found')).toBe('Ya no existe');
    expect(failureMessage('Permission denied')).toBe('Sin permisos en el servidor');
    expect(failureMessage('anything else')).toBe('No se pudo eliminar');
  });
});

describe('nextImageAfterDeletion', () => {
  const imgs = [file('1.jpg'), file('2.jpg'), file('3.jpg')];

  it('advances to the next surviving image', () => {
    expect(nextImageAfterDeletion(imgs, '1.jpg', new Set(['1.jpg']))).toBe('2.jpg');
    expect(nextImageAfterDeletion(imgs, '1.jpg', new Set(['1.jpg', '2.jpg']))).toBe('3.jpg');
  });

  it('falls back to the previous one at the end, and to null when nothing is left', () => {
    expect(nextImageAfterDeletion(imgs, '3.jpg', new Set(['3.jpg']))).toBe('2.jpg');
    expect(nextImageAfterDeletion(imgs, '2.jpg', new Set(['1.jpg', '2.jpg', '3.jpg']))).toBeNull();
    expect(nextImageAfterDeletion(imgs, 'missing.jpg', new Set())).toBeNull();
  });
});

describe('withoutDeleted', () => {
  it('removes deleted entries and anything below a deleted folder', () => {
    const entries = [file('a.jpg'), folder('docs'), file('x.txt', 'docs'), file('keep.jpg')];
    expect(withoutDeleted(entries, ['a.jpg', 'docs']).map((e) => e.path)).toEqual(['keep.jpg']);
  });
});
