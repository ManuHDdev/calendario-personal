import { describe, expect, it } from 'vitest';
import {
  buildBreadcrumbs,
  filterEntries,
  formatSize,
  imagesOf,
  normalize,
  parentPath,
  sortEntries,
  type DirEntry,
} from './files';

function entry(over: Partial<DirEntry> & { name: string }): DirEntry {
  return {
    path: over.name,
    type: 'file',
    size: 0,
    mtime: '2026-01-01T00:00:00.000Z',
    mime: null,
    category: 'other',
    ...over,
  };
}

const FILES: DirEntry[] = [
  entry({ name: 'b.jpg', size: 300, mtime: '2026-03-01T00:00:00.000Z', category: 'image' }),
  entry({ name: 'a.mp4', size: 900, mtime: '2026-01-01T00:00:00.000Z', category: 'video' }),
  entry({ name: 'Camión.PDF', size: 100, mtime: '2026-02-01T00:00:00.000Z', category: 'pdf' }),
  entry({ name: 'zdir', type: 'dir', category: null, mtime: '2020-01-01T00:00:00.000Z' }),
];

describe('sortEntries', () => {
  it('keeps folders first and orders files newest first', () => {
    expect(sortEntries(FILES, 'date', 'desc').map((e) => e.name)).toEqual(['zdir', 'b.jpg', 'Camión.PDF', 'a.mp4']);
  });

  it('flips to oldest first without moving folders', () => {
    expect(sortEntries(FILES, 'date', 'asc').map((e) => e.name)).toEqual(['zdir', 'a.mp4', 'Camión.PDF', 'b.jpg']);
  });

  it('sorts by name ignoring case and accents, with natural numbers', () => {
    const items = [entry({ name: 'img10.jpg' }), entry({ name: 'img2.jpg' }), entry({ name: 'Zeta.jpg' })];
    expect(sortEntries(items, 'name', 'asc').map((e) => e.name)).toEqual(['img2.jpg', 'img10.jpg', 'Zeta.jpg']);
  });

  it('sorts by size', () => {
    expect(sortEntries(FILES, 'size', 'desc').map((e) => e.name)).toEqual(['zdir', 'a.mp4', 'b.jpg', 'Camión.PDF']);
  });

  it('does not mutate its input', () => {
    const copy = [...FILES];
    sortEntries(FILES, 'name', 'asc');
    expect(FILES).toEqual(copy);
  });
});

describe('filterEntries', () => {
  it('matches by name ignoring case and accents', () => {
    expect(filterEntries(FILES, 'camion').map((e) => e.name)).toEqual(['Camión.PDF']);
    expect(filterEntries(FILES, '  JPG ').map((e) => e.name)).toEqual(['b.jpg']);
  });

  it('returns everything for an empty query', () => {
    expect(filterEntries(FILES, '')).toHaveLength(4);
  });

  it('filters files by category but keeps folders navigable', () => {
    expect(filterEntries(FILES, '', 'video').map((e) => e.name)).toEqual(['a.mp4', 'zdir']);
  });

  it('combines query and category', () => {
    expect(filterEntries(FILES, 'a', 'image').map((e) => e.name)).toEqual([]);
  });
});

describe('buildBreadcrumbs / parentPath', () => {
  it('always starts at the root', () => {
    expect(buildBreadcrumbs('')).toEqual([{ label: 'Inicio', path: '' }]);
  });

  it('builds cumulative paths', () => {
    expect(buildBreadcrumbs('fotos/2026/verano')).toEqual([
      { label: 'Inicio', path: '' },
      { label: 'fotos', path: 'fotos' },
      { label: '2026', path: 'fotos/2026' },
      { label: 'verano', path: 'fotos/2026/verano' },
    ]);
  });

  it('ignores stray slashes', () => {
    expect(buildBreadcrumbs('/a//b/').map((c) => c.path)).toEqual(['', 'a', 'a/b']);
  });

  it('computes the parent folder', () => {
    expect(parentPath('a/b/c')).toBe('a/b');
    expect(parentPath('a')).toBe('');
    expect(parentPath('')).toBe('');
  });
});

describe('helpers', () => {
  it('formats sizes in Spanish style', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(1536)).toBe('1,5 KB');
    expect(formatSize(5 * 1024 * 1024)).toBe('5,0 MB');
    expect(formatSize(300 * 1024 * 1024)).toBe('300 MB');
  });

  it('normalizes accents and case', () => {
    expect(normalize('ÁRBOL Ñandú')).toBe('arbol nandu');
  });

  it('lists only images for the lightbox', () => {
    expect(imagesOf(FILES).map((e) => e.name)).toEqual(['b.jpg']);
  });
});
