import { useEffect } from 'react';
import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import keycloak from '../auth/keycloak';

// Thin adapter around the shared <bunker-launcher> web component. The app list,
// icons, styles and behaviour live ONLY in launcher/ at the repo root, served
// by the platform at /launcher/ (nginx in production; locally the Vite dev
// server proxies /launcher to the launcher dev server on :5195). Do not add
// app entries here — edit launcher/public/apps.json.

export const LAUNCHER_SCRIPT_SRC = '/launcher/launcher.js';

type Placement = 'down' | 'up';
type Align = 'end' | 'start';
type Variant = 'default' | 'floating';

type BunkerLauncherElementProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  roles?: string;
  current?: string;
  placement?: Placement;
  align?: Align;
  variant?: Variant;
};

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'bunker-launcher': BunkerLauncherElementProps;
    }
  }
}

/** Adds the launcher script to <head> once per page; later calls are no-ops. */
export function ensureLauncherScript(doc: Document = document): void {
  if (doc.querySelector('script[data-bunker-launcher]')) return;
  const script = doc.createElement('script');
  script.src = LAUNCHER_SCRIPT_SRC;
  script.async = true;
  script.dataset.bunkerLauncher = '';
  doc.head.appendChild(script);
}

interface Props {
  /** Open the panel above the button (button at the bottom of the screen). */
  placement?: Placement;
  /** Anchor the panel to the button's left edge instead of its right edge. */
  align?: Align;
  /** Solid button with its own shadow, for buttons drawn over a map. */
  variant?: Variant;
}

export default function BunkerLauncher({ placement, align, variant }: Props) {
  useEffect(() => {
    ensureLauncherScript();
  }, []);

  const roles =
    (keycloak.tokenParsed as { realm_access?: { roles?: string[] } } | undefined)
      ?.realm_access?.roles ?? [];

  return (
    <bunker-launcher
      roles={roles.join(' ')}
      placement={placement}
      align={align}
      variant={variant}
    />
  );
}
