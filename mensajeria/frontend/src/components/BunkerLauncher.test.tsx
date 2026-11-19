import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const keycloakMock = vi.hoisted(() => ({
  tokenParsed: { realm_access: { roles: ['admin', 'familia'] } } as
    | { realm_access?: { roles?: string[] } }
    | undefined,
}));
vi.mock('../services/keycloak', () => ({ default: keycloakMock }));

import BunkerLauncher, { LAUNCHER_SCRIPT_SRC } from './BunkerLauncher';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  document.head.querySelectorAll('script[data-bunker-launcher]').forEach((s) => s.remove());
  keycloakMock.tokenParsed = { realm_access: { roles: ['admin', 'familia'] } };
});

const element = () => container.querySelector('bunker-launcher');

describe('BunkerLauncher', () => {
  it('renders the shared <bunker-launcher> with the Keycloak realm roles', () => {
    act(() => root.render(<BunkerLauncher />));
    expect(element()).not.toBeNull();
    expect(element()!.getAttribute('roles')).toBe('admin familia');
  });

  it('passes an empty role list when there is no session', () => {
    keycloakMock.tokenParsed = undefined;
    act(() => root.render(<BunkerLauncher />));
    expect(element()!.getAttribute('roles')).toBe('');
  });

  it('forwards the layout options', () => {
    act(() => root.render(<BunkerLauncher placement="up" align="start" variant="floating" />));
    expect(element()!.getAttribute('placement')).toBe('up');
    expect(element()!.getAttribute('align')).toBe('start');
    expect(element()!.getAttribute('variant')).toBe('floating');
  });

  it('loads the launcher script from the platform path exactly once', () => {
    act(() => root.render(<><BunkerLauncher /><BunkerLauncher /></>));
    const scripts = document.head.querySelectorAll('script[data-bunker-launcher]');
    expect(scripts).toHaveLength(1);
    expect(scripts.item(0)?.getAttribute('src')).toBe(LAUNCHER_SCRIPT_SRC);
    expect(LAUNCHER_SCRIPT_SRC).toBe('/launcher/launcher.js');
  });
});
