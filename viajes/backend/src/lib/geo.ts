export interface LatLng {
  lat: number;
  lng: number;
}

export type Profile = 'driving' | 'foot' | 'bike';

export const PROFILES: readonly Profile[] = ['driving', 'foot', 'bike'] as const;

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle (straight line) distance in metres between two points. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Average speeds (km/h) used ONLY to estimate a duration when OSRM is not
 * available. Straight-line distance underestimates the real road distance, so
 * a detour factor is applied to the estimated duration too.
 */
const FALLBACK_SPEED_KMH: Record<Profile, number> = { driving: 50, foot: 4.5, bike: 15 };
export const FALLBACK_DETOUR_FACTOR = 1.3;

/** Rough duration estimate (seconds) for a straight-line distance. */
export function estimateDurationSeconds(distanceM: number, profile: Profile): number {
  const metersPerSecond = (FALLBACK_SPEED_KMH[profile] * 1000) / 3600;
  return Math.round((distanceM * FALLBACK_DETOUR_FACTOR) / metersPerSecond);
}

/** Sum of straight-line distances along an ordered list of points. */
export function pathLengthMeters(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineMeters(points[i - 1], points[i]);
  return total;
}

/** Square matrix of straight-line distances (metres) between all points. */
export function haversineMatrix(points: LatLng[]): number[][] {
  return points.map((a) => points.map((b) => Math.round(haversineMeters(a, b))));
}
