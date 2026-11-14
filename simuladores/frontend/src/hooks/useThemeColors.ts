import { useEffect, useState } from 'react';

export interface ThemeColors {
  dark: boolean;
  canvasBg: string;
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderStrong: string;
  grid: string;
  accent: string;
  danger: string;
  success: string;
  warning: string;
  /** Categorical simulation palette. */
  series: string[];
}

function readColors(): ThemeColors {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    dark: document.documentElement.getAttribute('data-theme') === 'dark',
    canvasBg: v('--canvas-bg'),
    bgPrimary: v('--bg-primary'),
    bgSecondary: v('--bg-secondary'),
    bgTertiary: v('--bg-tertiary'),
    text: v('--text-primary'),
    textSecondary: v('--text-secondary'),
    textTertiary: v('--text-tertiary'),
    border: v('--border'),
    borderStrong: v('--border-strong'),
    grid: v('--sim-grid'),
    accent: v('--accent'),
    danger: v('--danger'),
    success: v('--success'),
    warning: v('--warning'),
    series: [v('--sim-1'), v('--sim-2'), v('--sim-3'), v('--sim-4'), v('--sim-5'), v('--sim-6')],
  };
}

/**
 * CSS-variable colours for canvas drawing. Canvases don't follow CSS
 * variables on their own, so this re-reads them whenever `data-theme` changes.
 */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState(readColors);
  useEffect(() => {
    const obs = new MutationObserver(() => setColors(readColors()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return colors;
}
