import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../services/keycloak', () => ({
  default: { token: 'tok', updateToken: vi.fn(), login: vi.fn() },
}));

import LazyImage from './LazyImage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // jsdom has no IntersectionObserver: LazyImage then loads immediately.
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const img = () => container.querySelector('img');
const fail = () => act(() => void img()!.dispatchEvent(new Event('error')));

describe('LazyImage', () => {
  it('requests the server-side thumbnail, not the original', () => {
    act(() => root.render(<LazyImage path="fotos/a.jpg" alt="a" />));
    expect(img()!.getAttribute('src')).toBe('/descargas/api/thumb?path=fotos%2Fa.jpg&w=320&token=tok');
    expect(img()!.getAttribute('alt')).toBe('a');
  });

  it('falls back to the original file when the thumbnail fails', () => {
    act(() => root.render(<LazyImage path="fotos/a.jpg" alt="a" />));
    fail();
    expect(img()!.getAttribute('src')).toBe('/descargas/api/file?path=fotos%2Fa.jpg&token=tok');
  });

  it('shows the placeholder icon when the original fails too', () => {
    act(() => root.render(<LazyImage path="fotos/a.jpg" alt="a" />));
    fail();
    fail();
    expect(img()).toBeNull();
    expect(container.querySelector('.lazy-image-placeholder')).not.toBeNull();
  });

  it('starts over with the thumbnail when the path changes', () => {
    act(() => root.render(<LazyImage path="a.jpg" alt="a" />));
    fail();
    expect(img()!.getAttribute('src')).toContain('/file?');
    act(() => root.render(<LazyImage path="b.jpg" alt="b" />));
    expect(img()!.getAttribute('src')).toBe('/descargas/api/thumb?path=b.jpg&w=320&token=tok');
  });
});
