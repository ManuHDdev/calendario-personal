import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import FileGrid from './FileGrid';
import type { FileItem } from '../types';

// jsdom no implementa IntersectionObserver. Se sustituye por una clase falsa
// que guarda el callback pasado al constructor, para poder invocarlo a mano
// desde el test y simular que el centinela entra en el viewport.
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  /** Simula que el centinela entra (o no) en el viewport. */
  trigger(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function buildFiles(count: number): FileItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `file-${i}`,
    name: `archivo-${i}.txt`,
    relativePath: `archivo-${i}.txt`,
    size: 1024,
    mimeType: 'text/plain',
    createdAt: new Date().toISOString(),
    folder: null,
  }));
}

const noop = () => {};

function renderGrid(files: FileItem[], resetKey: string) {
  return render(
    <FileGrid
      files={files}
      loading={false}
      onDeleteFile={noop}
      onMoveFile={noop}
      onPreviewFile={noop}
      onShareFile={noop}
      currentUserId="user-1"
      isAdmin={false}
      selected={new Set<string>()}
      onToggleSelect={noop}
      resetKey={resetKey}
    />,
  );
}

describe('FileGrid', () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders only the first PAGE_SIZE (60) files on initial mount', () => {
    const files = buildFiles(200);
    const { container } = renderGrid(files, 'folder-a');

    const cards = container.querySelectorAll('.file-card');
    expect(cards.length).toBe(60);
    expect(screen.getByText('archivo-0.txt')).toBeInTheDocument();
    expect(screen.queryByText('archivo-60.txt')).not.toBeInTheDocument();
  });

  it('grows the visible window when the sentinel intersects', () => {
    const files = buildFiles(200);
    const { container } = renderGrid(files, 'folder-a');

    expect(container.querySelectorAll('.file-card').length).toBe(60);

    const observer = FakeIntersectionObserver.instances[0];
    expect(observer).toBeDefined();
    act(() => observer.trigger(true));

    expect(container.querySelectorAll('.file-card').length).toBe(120);
  });

  it('grows only up to the total number of files when fewer than PAGE_SIZE remain', () => {
    const files = buildFiles(90);
    const { container } = renderGrid(files, 'folder-a');

    expect(container.querySelectorAll('.file-card').length).toBe(60);

    const observer = FakeIntersectionObserver.instances[0];
    act(() => observer.trigger(true));

    expect(container.querySelectorAll('.file-card').length).toBe(90);
  });

  it('resets the visible window back to PAGE_SIZE when resetKey changes', () => {
    const files = buildFiles(200);
    const { container, rerender } = renderGrid(files, 'folder-a');

    const observer = FakeIntersectionObserver.instances[0];
    act(() => observer.trigger(true));
    expect(container.querySelectorAll('.file-card').length).toBe(120);

    rerender(
      <FileGrid
        files={files}
        loading={false}
        onDeleteFile={noop}
        onMoveFile={noop}
        onPreviewFile={noop}
        onShareFile={noop}
        currentUserId="user-1"
        isAdmin={false}
        selected={new Set<string>()}
        onToggleSelect={noop}
        resetKey="folder-b"
      />,
    );

    expect(container.querySelectorAll('.file-card').length).toBe(60);
  });
});
