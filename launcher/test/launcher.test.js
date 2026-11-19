import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const APPS = [
  { id: 'calendario', name: 'Calendario', path: '/', devUrl: 'http://localhost:4200/', color: '#0071e3', roles: ['admin'], icon: '<rect x="3" y="4" width="18" height="18" rx="3"/>' },
  { id: 'storage', name: 'Storage', path: '/storage/', devUrl: 'http://localhost:5173/storage/', color: '#5e5ce6', roles: ['admin', 'familia'], icon: '<path d="M1 1"/>' },
  { id: 'ytdl', name: 'Ytdl', path: '/ytdl/', devUrl: 'http://localhost:5176/ytdl/', color: '#ff375f', roles: null, icon: '<path d="M1 1"/>' },
  { id: 'panel', name: 'Panel', path: '/panel/', devUrl: 'http://localhost:5174/panel/', color: '#ff9f0a', roles: ['admin'], icon: '<path d="M1 1"/>' },
];

let Launcher;
let darkQuery;

function mockMatchMedia(dark) {
  const listeners = new Set();
  darkQuery = {
    matches: dark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_t, fn) => listeners.add(fn),
    removeEventListener: (_t, fn) => listeners.delete(fn),
    set(value) {
      this.matches = value;
      listeners.forEach((fn) => fn({ matches: value }));
    },
  };
  window.matchMedia = vi.fn(() => darkQuery);
}

function stubRegistry(apps = APPS) {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ version: 1, apps }) }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function mount(attrs = {}) {
  const el = document.createElement('bunker-launcher');
  el.setAttribute('registry', '/launcher/apps.json');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  await vi.waitFor(() => {
    if (!el.shadowRoot.querySelector('.app, .message')) throw new Error('not rendered');
  });
  return el;
}

const shadow = (el) => el.shadowRoot;
const ids = (el) => [...shadow(el).querySelectorAll('.app')].map((a) => a.dataset.appId);
const button = (el) => shadow(el).querySelector('.btn');
const panel = (el) => shadow(el).querySelector('.panel');
const themeOf = (el) => shadow(el).querySelector('.root').getAttribute('data-theme');

beforeAll(async () => {
  mockMatchMedia(false);
  await import('../public/launcher.js');
  Launcher = customElements.get('bunker-launcher');
});

beforeEach(() => {
  mockMatchMedia(false);
  Launcher.clearRegistryCache();
  stubRegistry();
  document.documentElement.removeAttribute('data-theme');
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('registry rendering', () => {
  it('defines the custom element', () => {
    expect(Launcher).toBeDefined();
  });

  it('renders every app the user can see, in registry order, with name, icon and colour', async () => {
    const el = await mount({ roles: 'admin' });
    expect(ids(el)).toEqual(['calendario', 'storage', 'ytdl', 'panel']);

    const first = shadow(el).querySelector('.app');
    expect(first.querySelector('.name').textContent).toBe('Calendario');
    expect(first.querySelector('.icon svg rect')).not.toBeNull();
    expect(first.querySelector('.icon').style.background).toBe('rgb(0, 113, 227)');
  });

  it('uses the production path outside localhost', async () => {
    // jsdom runs on http://localhost:3000 by default, so check the helper directly.
    expect(Launcher.appHref(APPS[1], 'elbunkerdelingeniero.duckdns.org')).toBe('/storage/');
    expect(Launcher.appHref(APPS[1], 'localhost')).toBe('http://localhost:5173/storage/');
    expect(Launcher.appHref({ path: '/x/' }, 'localhost')).toBe('/x/');
  });

  it('links to the dev server URL on localhost', async () => {
    const el = await mount({ roles: 'admin' });
    const storage = shadow(el).querySelector('[data-app-id="storage"]');
    expect(storage.getAttribute('href')).toBe('http://localhost:5173/storage/');
  });

  it('fetches the registry once for several launchers on the same page', async () => {
    const fetchMock = stubRegistry();
    await mount({ roles: 'admin' });
    await mount({ roles: 'admin' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows a message (and keeps the button) when the registry cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })));
    const el = await mount({ roles: 'admin' });
    expect(button(el)).not.toBeNull();
    expect(shadow(el).querySelector('.message').textContent).toMatch(/couldn't load/i);
  });

  it('renders app names as text, never as HTML', async () => {
    stubRegistry([{ ...APPS[2], name: '<img src=x onerror=alert(1)>' }]);
    const el = await mount();
    expect(shadow(el).querySelector('img')).toBeNull();
    expect(shadow(el).querySelector('.name').textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('role filtering', () => {
  it('shows only public apps without roles (signed out)', async () => {
    const el = await mount();
    expect(ids(el)).toEqual(['ytdl']);
  });

  it('shows apps whose roles intersect the user roles', async () => {
    const el = await mount({ roles: 'familia invitado' });
    expect(ids(el)).toEqual(['storage', 'ytdl']);
  });

  it('accepts comma separated roles and an array via the property', async () => {
    const el = await mount({ roles: 'familia,admin' });
    expect(ids(el)).toEqual(['calendario', 'storage', 'ytdl', 'panel']);

    el.roles = ['familia'];
    expect(el.roles).toEqual(['familia']);
    expect(ids(el)).toEqual(['storage', 'ytdl']);
  });

  it('re-renders when the roles attribute changes (e.g. token refresh)', async () => {
    const el = await mount();
    el.setAttribute('roles', 'admin');
    expect(ids(el)).toContain('panel');
  });

  it('honours a roles property set before the element is connected', async () => {
    const pending = document.createElement('bunker-launcher');
    pending.roles = ['familia'];
    pending.setAttribute('registry', '/launcher/apps.json');
    document.body.appendChild(pending);
    await vi.waitFor(() => {
      if (!pending.shadowRoot.querySelector('.app')) throw new Error('not rendered');
    });
    expect(ids(pending)).toEqual(['storage', 'ytdl']);
  });

  it('visibleApps treats roles: null as public', () => {
    expect(Launcher.visibleApps(APPS, []).map((a) => a.id)).toEqual(['ytdl']);
  });
});

describe('current app highlight', () => {
  it('marks the app matching the URL path', async () => {
    window.history.replaceState({}, '', '/storage/carpeta/fotos');
    const el = await mount({ roles: 'admin' });
    const current = shadow(el).querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].dataset.appId).toBe('storage');
  });

  it('falls back to the root app ("/") for unknown paths', () => {
    expect(Launcher.detectCurrent(APPS, '/calendario/2026')).toBe('calendario');
    expect(Launcher.detectCurrent(APPS, '/panel')).toBe('panel');
    expect(Launcher.detectCurrent(APPS.slice(1), '/nada/')).toBeNull();
  });

  it('lets the host force the current app', async () => {
    window.history.replaceState({}, '', '/storage/');
    const el = await mount({ roles: 'admin', current: 'panel' });
    expect(shadow(el).querySelector('[aria-current="page"]').dataset.appId).toBe('panel');
  });
});

describe('theme', () => {
  it('follows <html data-theme> and reacts to changes', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const el = await mount({ roles: 'admin' });
    expect(themeOf(el)).toBe('dark');

    document.documentElement.setAttribute('data-theme', 'light');
    await vi.waitFor(() => expect(themeOf(el)).toBe('light'));
  });

  it('falls back to prefers-color-scheme when the host sets no theme', async () => {
    mockMatchMedia(true);
    const el = await mount({ roles: 'admin' });
    expect(themeOf(el)).toBe('dark');

    darkQuery.set(false);
    expect(themeOf(el)).toBe('light');
  });

  it('a theme attribute overrides everything', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const el = await mount({ roles: 'admin', theme: 'light' });
    expect(themeOf(el)).toBe('light');
  });

  it('defines its own colour tokens inside the shadow root (never transparent)', async () => {
    const el = await mount();
    const css = shadow(el).querySelector('style').textContent;
    expect(css).toMatch(/--bl-bg:\s*#ffffff/);
    expect(css).toMatch(/\[data-theme="dark"\][^}]*--bl-bg:\s*#1c1c1e/);
    expect(css).toMatch(/\.panel\s*{[^}]*background:\s*var\(--bl-bg\)/);
  });
});

describe('open / close', () => {
  it('is closed initially and toggles with the button', async () => {
    const el = await mount({ roles: 'admin' });
    expect(panel(el).hidden).toBe(true);
    expect(button(el).getAttribute('aria-expanded')).toBe('false');

    button(el).click();
    expect(el.open).toBe(true);
    expect(panel(el).hidden).toBe(false);
    expect(button(el).getAttribute('aria-expanded')).toBe('true');

    button(el).click();
    expect(el.open).toBe(false);
    expect(panel(el).hidden).toBe(true);
  });

  it('closes on a click outside but not on a click inside', async () => {
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    const el = await mount({ roles: 'admin' });

    button(el).click();
    panel(el).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
    expect(el.open).toBe(true);

    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
    expect(el.open).toBe(false);
  });

  it('closes on Escape and returns focus to the button', async () => {
    const el = await mount({ roles: 'admin' });
    button(el).click();
    const link = shadow(el).querySelector('.app');
    link.focus();
    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    expect(el.open).toBe(false);
    expect(shadow(el).activeElement).toBe(button(el));
  });

  it('moves focus between apps with the arrow keys', async () => {
    const el = await mount({ roles: 'admin' });
    button(el).click();
    const links = shadow(el).querySelectorAll('.app');
    links[0].focus();
    links[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }));
    expect(shadow(el).activeElement).toBe(links[1]);
    links[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, composed: true }));
    links[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, composed: true }));
    expect(shadow(el).activeElement).toBe(links[links.length - 1]);
  });

  it('closes when an app is chosen', async () => {
    const el = await mount({ roles: 'admin' });
    button(el).click();
    const link = shadow(el).querySelector('.app');
    link.addEventListener('click', (e) => e.preventDefault()); // keep jsdom from navigating
    link.click();
    expect(el.open).toBe(false);
  });

  it('emits a toggle event', async () => {
    const el = await mount({ roles: 'admin' });
    const seen = [];
    el.addEventListener('bunker-launcher-toggle', (e) => seen.push(e.detail.open));
    button(el).click();
    button(el).click();
    expect(seen).toEqual([true, false]);
  });
});

describe('layout options', () => {
  it('maps placement, align and variant attributes onto the shadow root', async () => {
    const el = await mount({ placement: 'up', align: 'start', variant: 'floating' });
    const root = shadow(el).querySelector('.root');
    expect(root.dataset.placement).toBe('up');
    expect(root.dataset.align).toBe('start');
    expect(root.dataset.variant).toBe('floating');

    el.setAttribute('placement', 'sideways');
    expect(root.dataset.placement).toBe('down');
  });

  it('re-anchors the panel inside the viewport when it would overflow', async () => {
    const el = await mount({ roles: 'admin' });
    const p = panel(el);
    const root = shadow(el).querySelector('.root');
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
    root.getBoundingClientRect = () => ({ left: 20, right: 52, width: 32 });
    p.getBoundingClientRect = () => ({ left: -150, right: 70, width: 220 });

    button(el).click();
    expect(p.style.left).toBe(`${8 - 20}px`);
    expect(p.style.right).toBe('auto');

    button(el).click();
    expect(p.style.left).toBe('');
  });
});
