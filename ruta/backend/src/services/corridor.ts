/**
 * Turns a route plus a maximum detour into a concrete list of Wallapop
 * queries to run.
 *
 * ── The geometry this is built on ──────────────────────────────────────────
 *
 * Wallapop's search API only accepts a CIRCLE (a centre plus
 * `distance_in_km`). What we actually want is a CORRIDOR: everything within
 * `maxDetourKm` of the driven route. So the corridor has to be covered by a
 * chain of circles centred on points along the route.
 *
 * Take any listing P inside the corridor, with R = maxDetourKm and centres
 * spaced S km apart measured ALONG the route:
 *
 *   - Let Q_P be the closest point of the route to P, so |P Q_P| <= R.
 *   - Centres sit every S km of arc length, so some centre C is at most S/2
 *     of ARC length away from Q_P, and the straight-line distance |Q_P C| is
 *     at most that arc (a chord is never longer than its arc).
 *   - Triangle inequality: |P C| <= |P Q_P| + |Q_P C| <= R + S/2.
 *
 * So a radius of `R + S/2` covers the whole corridor, which rearranges to
 *
 *     S = 2 * (Q - R)
 *
 * Note this REQUIRES Q > R: a chain of radius-R circles can never fully cover
 * a radius-R corridor, no matter how tightly they are packed.
 *
 * ── Why not the tighter-looking sqrt bound ────────────────────────────────
 *
 * The obvious worst case -- a listing at distance R, exactly halfway between
 * two centres -- suggests `Q >= sqrt(R^2 + (S/2)^2)`, which is smaller and so
 * cheaper. That bound is WRONG for a real route, because it silently assumes
 * the route is straight between consecutive centres. On the outside of a bend
 * the route curves away from the corridor edge, so the next centre is further
 * from the listing than the straight-line case predicts. Measured against a
 * coarse Badajoz-to-Madrid polyline, the sqrt bound left points up to 8%
 * outside the nearest search circle -- i.e. listings the user asked for,
 * silently missed, with no signal that anything was skipped.
 *
 * The triangle-inequality bound above makes no assumption about route shape,
 * so it holds on hairpins and motorways alike. See `corridor.test.ts`, which
 * walks the corridor edge of a bent route and asserts the property directly.
 *
 * ── Why the smallest workable Q is chosen ─────────────────────────────────
 *
 * A bigger Q covers the corridor in fewer requests, but each Wallapop
 * response is capped at a fixed page size. Over a large circle those slots get
 * spent on listings far off the route (in a city like Madrid, overwhelmingly
 * so), which are then discarded by the exact-distance filter. Small circles
 * therefore recall far more of the corridor per request. So the plan picks the
 * SMALLEST Q that still keeps the request count within budget, rather than the
 * largest Q that minimises requests.
 *
 * The exact perpendicular-distance filter still runs on every result
 * afterwards (see `routeSearch.ts`), so an over-wide circle never leaks
 * off-corridor listings into the output -- it only wastes recall.
 */

import { samplePointsAlong, type LatLng } from './geo';

/** Largest radius Wallapop's `distance_in_km` is worth asking for. */
export const MAX_WALLAPOP_RADIUS_KM = 100;

/** Largest detour we accept, kept well under the radius ceiling so Q > R always holds. */
export const MAX_DETOUR_KM = 50;

/** Default ceiling on Wallapop requests per search leg, to stay a polite client. */
export const DEFAULT_MAX_CENTERS = 40;

/**
 * Circles are never allowed to be tighter than this multiple of the detour
 * radius. Below it the spacing collapses and the request count explodes for
 * no real gain in recall.
 */
const MIN_RADIUS_FACTOR = 1.2;

export interface CorridorPlan {
  /** Centres of the Wallapop search circles, in travel order. */
  centers: LatLng[];
  /** Radius to send as `distance_in_km`, in km. */
  radiusKm: number;
  /** Distance between consecutive centres, in km. */
  spacingKm: number;
  /** The detour the plan was built for, echoed back for traceability. */
  maxDetourKm: number;
  /**
   * False only in the degenerate case where the detour is so large that no
   * allowed radius can guarantee coverage. Callers should surface this rather
   * than quietly implying the search was exhaustive.
   */
  fullCoverage: boolean;
}

export interface PlanCorridorOptions {
  maxCenters?: number;
}

/**
 * Builds the search plan for one route.
 *
 * @param route         Driven route as an ordered polyline.
 * @param maxDetourKm   How far off the route a listing may be.
 */
export function planCorridor(
  route: LatLng[],
  maxDetourKm: number,
  options: PlanCorridorOptions = {},
): CorridorPlan {
  if (route.length === 0) throw new Error('planCorridor: route is empty');
  if (maxDetourKm <= 0) throw new Error('planCorridor: maxDetourKm must be > 0');

  const maxCenters = Math.max(2, options.maxCenters ?? DEFAULT_MAX_CENTERS);

  if (route.length === 1) {
    return {
      centers: [route[0]],
      radiusKm: Math.min(Math.ceil(maxDetourKm), MAX_WALLAPOP_RADIUS_KM),
      spacingKm: 0,
      maxDetourKm,
      fullCoverage: true,
    };
  }

  const routeLengthKm = lengthOf(route);

  // Widest spacing that still fits inside the request budget...
  const budgetSpacingKm = routeLengthKm / (maxCenters - 1);
  // ...and the radius that spacing demands, via S = 2 * (Q - R).
  const radiusForBudget = maxDetourKm + budgetSpacingKm / 2;

  const radiusKm = Math.min(
    MAX_WALLAPOP_RADIUS_KM,
    Math.max(Math.ceil(radiusForBudget), Math.ceil(maxDetourKm * MIN_RADIUS_FACTOR)),
  );

  // Q > R is guaranteed while maxDetourKm <= MAX_DETOUR_KM, which the request
  // schema enforces. The guard keeps a bad direct call from producing a
  // non-positive spacing and silently searching nothing.
  const fullCoverage = radiusKm > maxDetourKm;
  const spacingKm = fullCoverage ? 2 * (radiusKm - maxDetourKm) : radiusKm;

  // `samplePointsAlong` interpolates linearly in degrees between polyline
  // vertices, so a step measured on the ground can overshoot the requested arc
  // length slightly. The overshoot grows with how far apart the vertices are:
  // negligible on a real ORS route (vertices every few tens of metres), but
  // measurable (~0.1%) on a coarse hand-written polyline. Shaving 1% off the
  // spacing keeps the real gap comfortably under the proven bound in both
  // cases, at the cost of roughly one extra request per hundred.
  const SPACING_SAFETY = 0.99;

  return {
    centers: samplePointsAlong(route, spacingKm * SPACING_SAFETY),
    radiusKm,
    spacingKm,
    maxDetourKm,
    fullCoverage,
  };
}

function lengthOf(route: LatLng[]): number {
  // Local copy rather than importing polylineLengthKm, so planCorridor walks
  // the route exactly once instead of twice.
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    const dLat = ((route[i].lat - route[i - 1].lat) * Math.PI) / 180;
    const dLng = ((route[i].lng - route[i - 1].lng) * Math.PI) / 180;
    const lat1 = (route[i - 1].lat * Math.PI) / 180;
    const lat2 = (route[i].lat * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    total += 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return total;
}
