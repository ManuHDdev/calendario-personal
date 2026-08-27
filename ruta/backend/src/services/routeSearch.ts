/**
 * The feature itself: "search Wallapop along the road from A to B".
 *
 * Pipeline
 *   1. Ask OpenRouteService for the driving route A -> B.
 *   2. Simplify the polyline (ORS returns thousands of vertices).
 *   3. Plan a chain of search circles that provably covers the corridor
 *      (see `corridor.ts` for the geometry).
 *   4. Query Wallapop at every circle, with bounded concurrency.
 *   5. Deduplicate, then filter by EXACT perpendicular distance to the route.
 *   6. Sort by position along the route -- the order you would drive past them.
 *
 * Step 5 is the reason this is not just "a search near some towns": Wallapop
 * returns per-item coordinates, so the "no more than N km off my route"
 * promise is enforced against the real route geometry rather than approximated
 * by the search radius.
 */

import { planCorridor, DEFAULT_MAX_CENTERS } from './corridor';
import {
  cumulativeDistancesKm,
  distanceToPolylineKm,
  simplifyPolyline,
  type LatLng,
} from './geo';
import { getDrivingRoute } from './ors';
import { searchWallapop, type WallapopItem } from './wallapop';
import type { CorridorListing, RouteSearchResult } from '../types/ruta';

/**
 * Polyline tolerance. Two orders of magnitude below the smallest usable
 * detour, so simplification cannot meaningfully move the corridor, while
 * cutting a multi-thousand-vertex motorway route down to something cheap to
 * measure against and light to send to the browser.
 */
const SIMPLIFY_TOLERANCE_KM = 0.05;

/** Wallapop pages fetched per search circle. Each page is 40 listings. */
const PAGES_PER_CENTER = 2;

/** Ceiling on total Wallapop requests for one search, to stay a polite client. */
const MAX_TOTAL_REQUESTS = DEFAULT_MAX_CENTERS * PAGES_PER_CENTER;

/** Concurrent in-flight Wallapop requests. */
const CONCURRENCY = 4;

export interface RouteSearchInput {
  origen: LatLng;
  destino: LatLng;
  keyword: string;
  desvioMaxKm: number;
  minPrice?: number | null;
  maxPrice?: number | null;
  /** Comma-separated words; a listing whose title contains one is dropped. */
  excluirPalabras?: string | null;
}

export async function searchAlongRoute(input: RouteSearchInput): Promise<RouteSearchResult> {
  const route = await getDrivingRoute(input.origen, input.destino);
  const polyline = simplifyPolyline(route.polyline, SIMPLIFY_TOLERANCE_KM);

  const plan = planCorridor(polyline, input.desvioMaxKm, {
    maxCenters: Math.floor(MAX_TOTAL_REQUESTS / PAGES_PER_CENTER),
  });

  const { items, requests, failedRequests } = await fetchAllCenters(plan.centers, {
    keyword: input.keyword,
    radiusKm: plan.radiusKm,
    minPrice: input.minPrice,
    maxPrice: input.maxPrice,
  });

  // The same listing is normally returned by several overlapping circles.
  const unique = new Map<string, WallapopItem>();
  for (const item of items) unique.set(item.externalId, item);

  const excluded = parseExcludeList(input.excluirPalabras);
  const cumulative = cumulativeDistancesKm(polyline);
  const listings: CorridorListing[] = [];

  for (const item of unique.values()) {
    if (!withinPriceBounds(item.price, input.minPrice, input.maxPrice)) continue;
    if (isExcluded(item.title, excluded)) continue;

    // The exact promise: perpendicular distance to the real route.
    const { distanceKm, alongKm } = distanceToPolylineKm(item.coords, polyline, cumulative);
    if (distanceKm > input.desvioMaxKm) continue;

    listings.push({
      site: 'wallapop',
      external_id: item.externalId,
      title: item.title,
      price: item.price,
      currency: item.currency,
      url: item.url,
      image_url: item.imageUrl,
      location: item.location,
      latitud: item.coords.lat,
      longitud: item.coords.lng,
      desvio_km: Math.round(distanceKm * 100) / 100,
      progreso_km: Math.round(alongKm * 10) / 10,
    });
  }

  // Travel order: the sequence you would actually encounter them in.
  listings.sort((a, b) => a.progreso_km - b.progreso_km);

  return {
    route: {
      polyline,
      distanceKm: route.distanceKm,
      durationMin: route.durationMin,
    },
    plan: {
      centers: plan.centers,
      radiusKm: plan.radiusKm,
      spacingKm: Math.round(plan.spacingKm * 100) / 100,
      fullCoverage: plan.fullCoverage,
    },
    listings,
    stats: {
      fetched: unique.size,
      matched: listings.length,
      requests,
      failedRequests,
    },
  };
}

interface CenterQuery {
  keyword: string;
  radiusKm: number;
  minPrice?: number | null;
  maxPrice?: number | null;
}

/**
 * Queries every circle with bounded concurrency.
 *
 * A circle that fails is counted and skipped rather than aborting the whole
 * search: partial results along most of the route are far more useful than an
 * error, provided the shortfall is reported back (`stats.failedRequests`) so
 * the UI can say the coverage was incomplete instead of implying it was not.
 */
async function fetchAllCenters(
  centers: LatLng[],
  query: CenterQuery,
): Promise<{ items: WallapopItem[]; requests: number; failedRequests: number }> {
  const items: WallapopItem[] = [];
  let requests = 0;
  let failedRequests = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= centers.length) return;

      requests++;
      try {
        const found = await searchWallapop({
          keyword: query.keyword,
          center: centers[index],
          radiusKm: query.radiusKm,
          minPrice: query.minPrice,
          maxPrice: query.maxPrice,
          maxPages: PAGES_PER_CENTER,
        });
        items.push(...found);
      } catch {
        failedRequests++;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, centers.length) }, () => worker()),
  );

  return { items, requests, failedRequests };
}

function withinPriceBounds(
  price: number | null,
  minPrice?: number | null,
  maxPrice?: number | null,
): boolean {
  // A listing with no price ("a convenir") is kept: it may still be the thing
  // being looked for, and excluding it on a max_price filter would be a guess.
  if (price === null) return true;
  if (minPrice !== undefined && minPrice !== null && price < minPrice) return false;
  if (maxPrice !== undefined && maxPrice !== null && price > maxPrice) return false;
  return true;
}

/** Lowercases and strips accents so "bateria" matches "batería". */
function foldText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function parseExcludeList(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((term) => foldText(term).trim())
    .filter(Boolean);
}

/**
 * Whole-word (or whole-phrase) title exclusion.
 *
 * Deliberately not plain substring containment: excluding "carta" must not
 * also drop a listing for a "cartabon". Wallapop's keyword matching is fuzzy
 * and routinely returns a different product type than the one asked for --
 * a search for a game matching trading cards, and so on.
 */
export function isExcluded(title: string, excluded: string[]): boolean {
  if (excluded.length === 0) return false;
  const folded = foldText(title);
  return excluded.some((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u').test(folded);
  });
}
