import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import type { DirEntry } from '../lib/files';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entry = (name: string, type: 'file' | 'dir' = 'file'): DirEntry => ({
  name,
  path: name,
  type,
  size: 1,
  mtime: '2026-01-01T00:00:00Z',
  mime: null,
  category: null,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const buttons = () => Array.from(container.querySelectorAll('button'));
const byText = (t: string) => buttons().find((b) => b.textContent?.includes(t));

function render(props: Partial<React.ComponentProps<typeof ConfirmDeleteDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  act(() =>
    root.render(
      <ConfirmDeleteDialog
        entries={[entry('a.jpg'), entry('docs', 'dir')]}
        pending={false}
        error={null}
        failures={null}
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...props}
      />,
    ),
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDeleteDialog', () => {
  it('states counts, lists names and warns that it is irreversible', () => {
    render();
    const text = container.textContent ?? '';
    expect(text).toContain('¿Eliminar 1 archivo y 1 carpeta?');
    expect(text).toContain('a.jpg');
    expect(text).toContain('docs/');
    expect(text).toContain('irreversible');
    expect(text).toContain('todo su contenido');
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
  });

  it('confirms and cancels through the buttons, with a danger-styled confirm', () => {
    const { onConfirm, onCancel } = render();
    const confirm = byText('Eliminar definitivamente')!;
    expect(confirm.className).toContain('confirm-btn--danger');
    act(() => confirm.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    act(() => byText('Cancelar')!.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels with Escape and with a click on the overlay, but not on the dialog itself', () => {
    const { onCancel } = render();
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onCancel).toHaveBeenCalledTimes(1);
    act(() => container.querySelector<HTMLElement>('.confirm-dialog')!.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
    act(() => container.querySelector<HTMLElement>('.confirm-backdrop')!.click());
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('disables the buttons and ignores Escape/overlay while the request is pending', () => {
    const { onConfirm, onCancel } = render({ pending: true });
    expect(buttons().every((b) => b.disabled)).toBe(true);
    expect(container.textContent).toContain('Eliminando…');
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    act(() => container.querySelector<HTMLElement>('.confirm-backdrop')!.click());
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows a request error and, after a partial failure, the failed items', () => {
    render({ error: 'No tienes permiso para eliminar archivos' });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('No tienes permiso');

    render({ failures: [{ name: 'b.jpg', error: 'Permission denied' }] });
    const text = container.textContent ?? '';
    expect(text).toContain('No se pudo eliminar todo');
    expect(text).toContain('b.jpg');
    expect(text).toContain('Sin permisos en el servidor');
    expect(byText('Eliminar definitivamente')).toBeUndefined();
  });
});
