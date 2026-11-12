import type { UiFilter } from '../types';

/** URL query parameter holding the active tab of the list: `/vine-resenas/?filtro=listos`. */
export const FILTRO_PARAM = 'filtro';
export const SEARCH_PARAM = 'q';

const FILTROS: readonly UiFilter[] = ['todos', 'faltan_fotos', 'falta_feedback', 'listos', 'resena_generada', 'en_espera'];

/** Unknown / missing value falls back to Todos. */
export function parseFiltro(raw: string | null): UiFilter {
  return FILTROS.find((f) => f === raw) ?? 'todos';
}

/** Next query string for a tab change; Todos is the default and stays out of the URL. Keeps the search. */
export function withFiltro(params: URLSearchParams, filtro: UiFilter): URLSearchParams {
  const next = new URLSearchParams(params);
  if (filtro === 'todos') next.delete(FILTRO_PARAM);
  else next.set(FILTRO_PARAM, filtro);
  return next;
}

/** Only same-app absolute paths are valid return targets (the value comes from router state). */
export function safeFrom(raw: unknown): string | null {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
}

const SCROLL_KEY = 'vine-list-scroll';

// sessionStorage can throw (private mode, blocked storage): scroll restore is a nicety, never a requirement.
export function saveScroll(key: string, y: number): void {
  try {
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ key, y }));
  } catch {
    /* ignore */
  }
}

/** Returns the saved scroll position for this exact list URL once, then forgets it. */
export function takeScroll(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(SCROLL_KEY);
    const v = JSON.parse(raw) as { key?: string; y?: number };
    return v.key === key && typeof v.y === 'number' ? v.y : null;
  } catch {
    return null;
  }
}
