/**
 * Agrega el consumo de las APIs externas rastreadas por otras subapps
 * (Paraísos → ORS, Watchlist → TMDB/Google Books, Fútbol → football_data)
 * llamando a su endpoint interno `GET .../api/usage`. Fútbol es un repo
 * externo al monorepo (ver sección "Fútbol" de CLAUDE.md), pero comparte el
 * mismo contrato interno (`PANEL_INTERNAL_TOKEN`, misma forma de respuesta)
 * que Paraísos/Watchlist, así que se agrega igual. Ver
 * openspec/changes/2026-09-09-add-api-usage-dashboard/design.md
 * ("Panel → subapp calls") para el porqué de Promise.allSettled + timeout +
 * degradación por-tarjeta en vez de fallar toda la petición.
 */

export interface ApiUsageEntry {
  api: string;
  label: string;
  callsToday: number | null;
  dailyLimit: number | null;
  remaining: number | null;
  resetsAt: string | null;
  unavailable: boolean;
}

interface RawUsageEntry {
  api: string;
  label: string;
  callsToday: number;
  dailyLimit: number | null;
  remaining: number | null;
  resetsAt: string;
}

interface KnownApi {
  api: string;
  label: string;
}

const PARAISOS_APIS: KnownApi[] = [{ api: 'ors', label: 'OpenRouteService' }];
const WATCHLIST_APIS: KnownApi[] = [
  { api: 'tmdb', label: 'TMDB' },
  { api: 'google_books', label: 'Google Books' },
];
const FUTBOL_APIS: KnownApi[] = [{ api: 'football_data', label: 'Football-Data.org' }];

const TIMEOUT_MS = 3000;

async function fetchUsage(baseUrl: string, path: string, token: string): Promise<RawUsageEntry[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Usage endpoint at ${baseUrl}${path} responded ${res.status}`);
    }
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) {
      throw new Error(`Usage endpoint at ${baseUrl}${path} returned a malformed body`);
    }
    return body as RawUsageEntry[];
  } finally {
    clearTimeout(timer);
  }
}

function unavailableEntry(known: KnownApi): ApiUsageEntry {
  return {
    api: known.api,
    label: known.label,
    callsToday: null,
    dailyLimit: null,
    remaining: null,
    resetsAt: null,
    unavailable: true,
  };
}

function resolveEntries(
  known: KnownApi[],
  result: PromiseSettledResult<RawUsageEntry[]>,
): ApiUsageEntry[] {
  if (result.status === 'rejected') {
    return known.map(unavailableEntry);
  }
  return known.map((k) => {
    const found = result.value.find((e) => e.api === k.api);
    if (!found) return unavailableEntry(k);
    return { ...found, unavailable: false };
  });
}

/**
 * Devuelve el consumo de hoy de las cuatro APIs externas rastreadas
 * (ors, tmdb, google_books, football_data), siempre en ese orden. Un fallo al
 * llamar a un subapp degrada solo las entradas de ESE subapp a
 * `unavailable: true` — el resto de entradas se devuelve normalmente.
 */
export async function getAllUsage(): Promise<ApiUsageEntry[]> {
  const token = process.env.PANEL_INTERNAL_TOKEN ?? '';
  const paraisosUrl = process.env.PARAISOS_BACKEND_URL || 'http://paraisos-backend:3007';
  const watchlistUrl = process.env.WATCHLIST_BACKEND_URL || 'http://watchlist-backend:3009';
  const futbolUrl = process.env.FUTBOL_BACKEND_URL || 'http://football-predictor-backend-1:8000';

  const [paraisosResult, watchlistResult, futbolResult] = await Promise.allSettled([
    fetchUsage(paraisosUrl, '/paraisos/api/usage', token),
    fetchUsage(watchlistUrl, '/watchlist/api/usage', token),
    fetchUsage(futbolUrl, '/futbol/api/usage', token),
  ]);

  return [
    ...resolveEntries(PARAISOS_APIS, paraisosResult),
    ...resolveEntries(WATCHLIST_APIS, watchlistResult),
    ...resolveEntries(FUTBOL_APIS, futbolResult),
  ];
}
