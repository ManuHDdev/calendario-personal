/**
 * Wallapop search client.
 *
 * Calls the same internal JSON endpoint the wallapop.com web frontend calls.
 * This is UNOFFICIAL -- not the paid partner API -- and can break without
 * notice if Wallapop changes their frontend. Everything below (endpoint,
 * parameter names, response shape, per-item coordinates, and the `next_page`
 * pagination token) was confirmed against live responses on 2026-08-27.
 *
 * The same endpoint is already used by the `marketplace-watcher` project in
 * this ecosystem; the difference here is that this client reads
 * `location.latitude`/`location.longitude` off each item, which is what makes
 * an exact route-corridor filter possible rather than a radius approximation.
 */

import type { LatLng } from './geo';

const SEARCH_URL = 'https://api.wallapop.com/api/v3/search';

/** Wallapop returns 40 items per page; asking for more is not supported. */
export const PAGE_SIZE = 40;

export class WallapopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WallapopError';
  }
}

/**
 * Desktop User-Agents, rotated per request. Not an evasion measure -- the
 * default Node fetch UA is simply rejected by a lot of consumer sites.
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export interface WallapopItem {
  externalId: string;
  title: string;
  price: number | null;
  currency: string;
  url: string;
  imageUrl: string | null;
  location: string;
  coords: LatLng;
}

export interface WallapopSearchParams {
  keyword: string;
  center: LatLng;
  radiusKm: number;
  minPrice?: number | null;
  maxPrice?: number | null;
  /** Pages to walk per centre. Each page is 40 items. */
  maxPages?: number;
  timeoutMs?: number;
}

interface RawItem {
  id?: unknown;
  title?: unknown;
  web_slug?: unknown;
  price?: { amount?: unknown; currency?: unknown } | null;
  location?: {
    latitude?: unknown;
    longitude?: unknown;
    city?: unknown;
    region?: unknown;
    region2?: unknown;
  } | null;
  images?: Array<{ urls?: { small?: unknown; medium?: unknown } | null }> | null;
}

/**
 * Runs one keyword search around one centre, walking up to `maxPages` pages.
 *
 * Items without usable coordinates are dropped rather than guessed at: this
 * feature's entire promise is "no more than N km off your route", and a
 * listing whose position is unknown cannot honestly be said to satisfy that.
 */
export async function searchWallapop(params: WallapopSearchParams): Promise<WallapopItem[]> {
  const { keyword, center, radiusKm, minPrice, maxPrice } = params;
  const maxPages = Math.max(1, params.maxPages ?? 1);
  const timeoutMs = params.timeoutMs ?? 15_000;

  const query = new URLSearchParams({
    source: 'quick_filters',
    keywords: keyword,
    latitude: String(center.lat),
    longitude: String(center.lng),
    order_by: 'newest',
    distance_in_km: String(radiusKm),
  });
  if (minPrice !== undefined && minPrice !== null) query.set('min_sale_price', String(minPrice));
  if (maxPrice !== undefined && maxPrice !== null) query.set('max_sale_price', String(maxPrice));

  const collected: WallapopItem[] = [];
  let nextPage: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    // After the first page Wallapop expects ONLY the opaque token: it already
    // encodes the original query plus the offset.
    const url =
      page === 0
        ? `${SEARCH_URL}?${query.toString()}`
        : `${SEARCH_URL}?next_page=${encodeURIComponent(nextPage as string)}`;

    const payload = await fetchJson(url, timeoutMs);
    const items = extractItems(payload);

    for (const raw of items) {
      const parsed = parseItem(raw);
      if (parsed) collected.push(parsed);
    }

    nextPage = extractNextPage(payload);
    // A short page or a missing token both mean there is nothing left here.
    if (!nextPage || items.length < PAGE_SIZE) break;
  }

  return collected;
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': randomUserAgent(),
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        // Sent by the real web frontend; a harmless best-effort include.
        'X-DeviceOS': '0',
      },
    });

    if (!res.ok) {
      throw new WallapopError(`Wallapop respondio ${res.status}`);
    }
    return (await res.json()) as unknown;
  } catch (err) {
    if (err instanceof WallapopError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new WallapopError(`Wallapop no respondio en ${timeoutMs} ms`);
    }
    throw new WallapopError(
      `Fallo la peticion a Wallapop: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function extractItems(payload: unknown): RawItem[] {
  const items = (payload as { data?: { section?: { payload?: { items?: unknown } } } })?.data
    ?.section?.payload?.items;

  if (!Array.isArray(items)) {
    throw new WallapopError(
      'Respuesta de Wallapop con forma inesperada; es probable que hayan cambiado su API interna',
    );
  }
  return items as RawItem[];
}

function extractNextPage(payload: unknown): string | null {
  const token = (payload as { meta?: { next_page?: unknown } })?.meta?.next_page;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

function parseItem(raw: RawItem): WallapopItem | null {
  const id = raw.id;
  const slug = raw.web_slug;
  if ((typeof id !== 'string' && typeof id !== 'number') || typeof slug !== 'string' || !slug) {
    return null;
  }

  const lat = raw.location?.latitude;
  const lng = raw.location?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    // No coordinates means the detour promise cannot be verified. Drop it.
    return null;
  }

  const amount = raw.price?.amount;
  const city = typeof raw.location?.city === 'string' ? raw.location.city : null;
  const region =
    typeof raw.location?.region2 === 'string'
      ? raw.location.region2
      : typeof raw.location?.region === 'string'
        ? raw.location.region
        : null;

  const firstImage = Array.isArray(raw.images) ? raw.images[0] : null;
  const imageUrl =
    typeof firstImage?.urls?.medium === 'string'
      ? firstImage.urls.medium
      : typeof firstImage?.urls?.small === 'string'
        ? firstImage.urls.small
        : null;

  return {
    externalId: String(id),
    title: typeof raw.title === 'string' && raw.title ? raw.title : '(sin titulo)',
    price: typeof amount === 'number' ? amount : null,
    currency: typeof raw.price?.currency === 'string' ? raw.price.currency : 'EUR',
    url: `https://es.wallapop.com/item/${slug}`,
    imageUrl,
    location: [city, region].filter(Boolean).join(', ') || 'Ubicacion desconocida',
    coords: { lat, lng },
  };
}
