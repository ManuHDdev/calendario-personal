/**
 * Pure geographic helpers for the route-corridor search.
 *
 * Everything here is deliberately dependency-free and side-effect-free so it
 * can be unit tested without touching the network. All distances are in
 * kilometres and all coordinates use the `{ lat, lng }` convention (note that
 * OpenRouteService emits `[lng, lat]` pairs -- convert at the boundary, not
 * here).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Mean Earth radius in km, as used by the standard haversine formula. */
const EARTH_RADIUS_KM = 6371.0088;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance between two points, in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Projects a point onto a local east/north plane in km, centred on `origin`.
 *
 * An equirectangular projection is accurate to well under a metre over the
 * few-kilometre spans this module compares, which is far below the precision
 * of the coordinates Wallapop reports anyway, and it makes point-to-segment
 * distance a plain 2D problem instead of a spherical one.
 */
function toLocalKm(point: LatLng, origin: LatLng): { x: number; y: number } {
  const latRef = toRad(origin.lat);
  return {
    x: toRad(point.lng - origin.lng) * Math.cos(latRef) * EARTH_RADIUS_KM,
    y: toRad(point.lat - origin.lat) * EARTH_RADIUS_KM,
  };
}

/**
 * Shortest distance in km from `point` to the segment `a`--`b`, plus how far
 * along that segment (0..1) the closest approach happens.
 */
export function distanceToSegmentKm(
  point: LatLng,
  a: LatLng,
  b: LatLng,
): { distanceKm: number; t: number } {
  const p = toLocalKm(point, a);
  const q = toLocalKm(b, a);

  const segLenSq = q.x * q.x + q.y * q.y;
  if (segLenSq === 0) {
    // Degenerate segment (duplicated vertex): fall back to the endpoint.
    return { distanceKm: Math.hypot(p.x, p.y), t: 0 };
  }

  // Clamped scalar projection of p onto q.
  const t = Math.max(0, Math.min(1, (p.x * q.x + p.y * q.y) / segLenSq));
  const dx = p.x - t * q.x;
  const dy = p.y - t * q.y;
  return { distanceKm: Math.hypot(dx, dy), t };
}

/** Per-vertex cumulative distance from the start of the polyline, in km. */
export function cumulativeDistancesKm(polyline: LatLng[]): number[] {
  const cumulative: number[] = new Array(polyline.length);
  cumulative[0] = 0;
  for (let i = 1; i < polyline.length; i++) {
    cumulative[i] = cumulative[i - 1] + haversineKm(polyline[i - 1], polyline[i]);
  }
  return cumulative;
}

/** Total length of a polyline in km. */
export function polylineLengthKm(polyline: LatLng[]): number {
  if (polyline.length < 2) return 0;
  const cumulative = cumulativeDistancesKm(polyline);
  return cumulative[cumulative.length - 1];
}

export interface PolylineProximity {
  /** Perpendicular distance from the point to the nearest part of the route. */
  distanceKm: number;
  /** How far along the route (from its start) that nearest part sits. */
  alongKm: number;
}

/**
 * Shortest distance from `point` to a polyline, and how far along the polyline
 * the closest approach happens.
 *
 * `alongKm` is what lets results be ordered by "when would I drive past this"
 * rather than by raw distance, which is the ordering that actually matters
 * when you are planning stops on a trip.
 */
export function distanceToPolylineKm(
  point: LatLng,
  polyline: LatLng[],
  cumulative?: number[],
): PolylineProximity {
  if (polyline.length === 0) {
    throw new Error('distanceToPolylineKm: polyline is empty');
  }
  if (polyline.length === 1) {
    return { distanceKm: haversineKm(point, polyline[0]), alongKm: 0 };
  }

  const cum = cumulative ?? cumulativeDistancesKm(polyline);
  let best: PolylineProximity = { distanceKm: Infinity, alongKm: 0 };

  for (let i = 0; i < polyline.length - 1; i++) {
    const { distanceKm, t } = distanceToSegmentKm(point, polyline[i], polyline[i + 1]);
    if (distanceKm < best.distanceKm) {
      best = {
        distanceKm,
        alongKm: cum[i] + t * (cum[i + 1] - cum[i]),
      };
    }
  }
  return best;
}

/**
 * Places points along a polyline at a fixed spacing, always including both
 * endpoints.
 *
 * These become the centres of the Wallapop search circles, so the spacing is
 * what determines whether the corridor is fully covered -- see
 * `planCorridor` in `corridor.ts` for how the spacing is derived.
 */
export function samplePointsAlong(polyline: LatLng[], spacingKm: number): LatLng[] {
  if (spacingKm <= 0) throw new Error('samplePointsAlong: spacingKm must be > 0');
  if (polyline.length === 0) return [];
  if (polyline.length === 1) return [polyline[0]];

  const cum = cumulativeDistancesKm(polyline);
  const total = cum[cum.length - 1];
  if (total === 0) return [polyline[0]];

  const samples: LatLng[] = [];
  let segment = 0;

  for (let target = 0; target < total; target += spacingKm) {
    while (segment < polyline.length - 2 && cum[segment + 1] < target) segment++;
    const segStart = cum[segment];
    const segLen = cum[segment + 1] - segStart;
    const t = segLen === 0 ? 0 : (target - segStart) / segLen;
    const a = polyline[segment];
    const b = polyline[segment + 1];
    samples.push({
      lat: a.lat + t * (b.lat - a.lat),
      lng: a.lng + t * (b.lng - a.lng),
    });
  }

  // The loop above stops short of the end whenever the route length is not an
  // exact multiple of the spacing; without this the tail of the trip would
  // never be searched.
  samples.push(polyline[polyline.length - 1]);
  return samples;
}

/**
 * Ramer-Douglas-Peucker simplification, iterative so a long motorway route
 * (ORS routinely returns several thousand vertices) cannot blow the stack.
 *
 * Used to keep the per-listing distance check cheap and to avoid shipping a
 * needlessly heavy polyline to the browser. The tolerance is far smaller than
 * any usable detour radius, so it does not meaningfully move the corridor.
 */
export function simplifyPolyline(polyline: LatLng[], toleranceKm: number): LatLng[] {
  if (polyline.length <= 2 || toleranceKm <= 0) return polyline.slice();

  const keep = new Array<boolean>(polyline.length).fill(false);
  keep[0] = true;
  keep[polyline.length - 1] = true;

  const stack: Array<[number, number]> = [[0, polyline.length - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    if (last <= first + 1) continue;

    let maxDistance = -1;
    let index = first;
    for (let i = first + 1; i < last; i++) {
      const { distanceKm } = distanceToSegmentKm(polyline[i], polyline[first], polyline[last]);
      if (distanceKm > maxDistance) {
        maxDistance = distanceKm;
        index = i;
      }
    }

    if (maxDistance > toleranceKm) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }

  return polyline.filter((_, i) => keep[i]);
}
