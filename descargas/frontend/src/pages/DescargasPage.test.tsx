import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import type { DirEntry } from '../lib/files';

const api = vi.hoisted(() => ({
  listDir: vi.fn(),
  deletePaths: vi.fn(),
  currentRoles: vi.fn(),
}));

vi.mock('../services/api', () => ({
  listDir: api.listDir,
  deletePaths: api.deletePaths,
  currentRoles: api.currentRoles,
  refreshToken: vi.fn(async () => undefined),
  fileUrl: (p: string) => `/f/${p}`,
  downloadUrl: (p: string) => `/d/${p}`,
  thumbUrl: (p: string) => `/t/${p}`,
}));
vi.mock('../components/AppLauncher', () => ({ default: () => null }));
vi.mock('../components/ThemeToggle', () => ({ default: () => null }));

import DescargasPage from './DescargasPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const file = (name: string, category: DirEntry['category'] = 'text'): DirEntry => ({
  name,
  path: name,
  type: 'file',
  size: 10,
  mtime: '2026-01-01T00:00:00Z',
  mime: 'text/plain',
  category,
});

let container: HTMLDivElement;
let root: Root;

async function mount() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <DescargasPage />
      </MemoryRouter>,
    );
  });
}

const q = (sel: string) => container.querySelector<HTMLElement>(sel);
const qa = (sel: string) => Array.from(container.querySelectorAll<HTMLElement>(sel));
const button = (text: string) => qa('button').find((b) => b.textContent?.includes(text));
/** Fake server: deletePaths answers and the next listing no longer has the deleted files. */
function serverDeletes(deleted: string[], failed: { path: string; error: string }[] = []) {
  api.deletePaths.mockImplementation(async () => {
    api.listDir.mockResolvedValue({
      path: '',
      entries: ['a.txt', 'b.txt', 'c.txt'].filter((n) => !deleted.includes(n)).map((n) => file(n)),
    });
    return { deleted, failed };
  });
}
const flush = () => act(async () => void (await Promise.resolve()));

beforeEach(() => {
  api.listDir.mockResolvedValue({ path: '', entries: [file('a.txt'), file('b.txt'), file('c.txt')] });
  api.deletePaths.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('DescargasPage delete UI', () => {
  it('shows no delete controls to descargas_invitado', async () => {
    api.currentRoles.mockReturnValue(['descargas_invitado']);
    await mount();
    expect(qa('.entry')).toHaveLength(3);
    expect(q('.entry-check')).toBeNull();
    expect(q('.entry-delete')).toBeNull();
    expect(button('Seleccionar')).toBeUndefined();
  });

  it.each([['admin'], ['descargas_admin']])('shows delete controls to %s', async (role) => {
    api.currentRoles.mockReturnValue([role]);
    await mount();
    expect(qa('.entry-check')).toHaveLength(3);
    expect(qa('.entry-delete')).toHaveLength(3);
    expect(button('Seleccionar')).toBeDefined();
  });

  it('deletes a single file from its trash button after confirmation', async () => {
    api.currentRoles.mockReturnValue(['admin']);
    serverDeletes(['b.txt']);
    await mount();
    act(() => q('[aria-label="Eliminar b.txt"]')!.click());
    expect(q('[role="alertdialog"]')!.textContent).toContain('¿Eliminar este archivo?');
    expect(api.deletePaths).not.toHaveBeenCalled();
    await act(async () => button('Eliminar definitivamente')!.click());
    expect(api.deletePaths).toHaveBeenCalledWith(['b.txt']);
    await flush();
    expect(q('[role="alertdialog"]')).toBeNull();
    expect(qa('.entry-name').map((n) => n.textContent)).toEqual(['a.txt', 'c.txt']);
  });

  it('selects several files, counts them, selects all and deletes with one request', async () => {
    api.currentRoles.mockReturnValue(['admin']);
    serverDeletes(['a.txt', 'b.txt', 'c.txt']);
    await mount();
    act(() => button('Seleccionar')!.click());
    expect(q('.selection-bar')!.textContent).toContain('0 seleccionados');
    expect(button('Eliminar (0)')!.hasAttribute('disabled')).toBe(true);

    act(() => q('[aria-label="Seleccionar a.txt"]')!.click());
    expect(q('.selection-bar')!.textContent).toContain('1 seleccionado');

    act(() => button('Seleccionar todo (3)')!.click());
    expect(q('.selection-bar')!.textContent).toContain('3 seleccionados');
    expect(button('Quitar selección')).toBeDefined();

    act(() => button('Eliminar (3)')!.click());
    expect(q('[role="alertdialog"]')!.textContent).toContain('¿Eliminar 3 archivos?');
    await act(async () => button('Eliminar definitivamente')!.click());
    expect(api.deletePaths).toHaveBeenCalledWith(['a.txt', 'b.txt', 'c.txt']);
    await flush();
    expect(q('.selection-bar')).toBeNull(); // selection mode ends after a clean delete
    expect(qa('.entry')).toHaveLength(0);
  });

  it('keeps the dialog open with the failures when only part of the batch is deleted', async () => {
    api.currentRoles.mockReturnValue(['admin']);
    serverDeletes(['a.txt'], [{ path: 'b.txt', error: 'Permission denied' }]);
    await mount();
    act(() => q('[aria-label="Seleccionar a.txt"]')!.click());
    act(() => q('[aria-label="Seleccionar b.txt"]')!.click());
    act(() => button('Eliminar (2)')!.click());
    await act(async () => button('Eliminar definitivamente')!.click());
    await flush();
    const dialog = q('[role="alertdialog"]')!;
    expect(dialog.textContent).toContain('b.txt');
    expect(dialog.textContent).toContain('Sin permisos en el servidor');
    expect(qa('.entry-name').map((n) => n.textContent)).toEqual(['b.txt', 'c.txt']);
  });

  it('does not delete anything when the confirmation is cancelled', async () => {
    api.currentRoles.mockReturnValue(['admin']);
    await mount();
    act(() => q('[aria-label="Eliminar a.txt"]')!.click());
    act(() => button('Cancelar')!.click());
    expect(q('[role="alertdialog"]')).toBeNull();
    expect(api.deletePaths).not.toHaveBeenCalled();
    expect(qa('.entry')).toHaveLength(3);
  });
});
