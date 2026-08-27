import { describe, it, expect } from 'vitest';
import { planCorridor, MAX_WALLAPOP_RADIUS_KM, DEFAULT_MAX_CENTERS } from './corridor';
import { haversineKm, polylineLengthKm, type LatLng } from './geo';

/** Roughly La Coronada (Badajoz) to Madrid, as a coarse polyline. */
const LA_CORONADA_TO_MADRID: LatLng[] = [
  { lat: 38.9167, lng: -5.6667 },
  { lat: 39.0833, lng: -5.3333 },
  { lat: 39.3, lng: -4.9 },
  { lat: 39.6, lng: -4.4 },
  { lat: 39.8628, lng: -4.0273 },
  { lat: 40.1, lng: -3.9 },
  { lat: 40.4168, lng: -3.7038 },
];

const SHORT_HOP: LatLng[] = [
  { lat: 40.4168, lng: -3.7038 },
  { lat: 40.4675, lng: -3.5678 },
];

/**
 * Walks the corridor edge and asserts every point on it falls inside at least
 * one planned search circle.
 *
 * This is the property the whole feature rests on: if a point sitting exactly
 * at the maximum detour can slip between two circles, the app silently misses
 * listings and the user has no way of knowing.
 */
function worstCaseCoverageRatio(route: LatLng[], maxDetourKm: number): number {
  const plan = planCorridor(route, maxDetourKm);
  let worst = 0;

  // Sample the corridor edge densely on both sides of every route leg.
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    for (let s = 0; s <= 1; s += 0.02) {
      const on = { lat: a.lat + s * (b.lat - a.lat), lng: a.lng + s * (b.lng - a.lng) };

      // Unit normal to the leg, in degrees, scaled to the detour distance.
      const dLat = b.lat - a.lat;
      const dLng = (b.lng - a.lng) * Math.cos((on.lat * Math.PI) / 180);
      const norm = Math.hypot(dLat, dLng) || 1;
      const offLat = (-dLng / norm) * (maxDetourKm / 111.19);
      const offLng =
        ((dLat / norm) * (maxDetourKm / 111.19)) / Math.cos((on.lat * Math.PI) / 180);

      for (const sign of [1, -1]) {
        const edge = { lat: on.lat + sign * offLat, lng: on.lng + sign * offLng };
        let nearest = Infinity;
        for (const c of plan.centers) nearest = Math.min(nearest, haversineKm(edge, c));
        worst = Math.max(worst, nearest / plan.radiusKm);
      }
    }
  }
  return worst;
}

describe('planCorridor coverage guarantee', () => {
  it.each([1, 2, 5, 10, 25])(
    'covers every point at %i km of detour on a long route',
    (detour) => {
      // A ratio <= 1 means the furthest corridor point still lands inside a
      // search circle. A small epsilon absorbs the flat-earth approximation
      // used to build the test's own corridor edge.
      expect(worstCaseCoverageRatio(LA_CORONADA_TO_MADRID, detour)).toBeLessThanOrEqual(1.02);
    },
  );

  it('covers the corridor on a short hop too', () => {
    expect(worstCaseCoverageRatio(SHORT_HOP, 5)).toBeLessThanOrEqual(1.02);
  });

  it('always picks a radius strictly larger than the detour', () => {
    // A chain of radius-R circles can never cover a radius-R corridor, so a
    // plan with radiusKm === maxDetourKm would be quietly lossy.
    for (const detour of [1, 3, 5, 10, 25, 50]) {
      const plan = planCorridor(LA_CORONADA_TO_MADRID, detour);
      expect(plan.radiusKm).toBeGreaterThan(detour);
      expect(plan.fullCoverage).toBe(true);
    }
  });
});

describe('planCorridor request budget', () => {
  it('stays within the default centre budget on a long route', () => {
    for (const detour of [1, 2, 5, 10, 25, 50]) {
      const plan = planCorridor(LA_CORONADA_TO_MADRID, detour);
      expect(plan.centers.length).toBeLessThanOrEqual(DEFAULT_MAX_CENTERS + 1);
    }
  });

  it('respects a tighter explicit budget', () => {
    const plan = planCorridor(LA_CORONADA_TO_MADRID, 5, { maxCenters: 10 });
    expect(plan.centers.length).toBeLessThanOrEqual(11);
  });

  it('buys a smaller budget with a larger radius', () => {
    const generous = planCorridor(LA_CORONADA_TO_MADRID, 5, { maxCenters: 40 });
    const tight = planCorridor(LA_CORONADA_TO_MADRID, 5, { maxCenters: 6 });
    expect(tight.radiusKm).toBeGreaterThan(generous.radiusKm);
    expect(tight.centers.length).toBeLessThan(generous.centers.length);
  });

  it('never asks Wallapop for more than its usable radius ceiling', () => {
    const plan = planCorridor(LA_CORONADA_TO_MADRID, 50, { maxCenters: 2 });
    expect(plan.radiusKm).toBeLessThanOrEqual(MAX_WALLAPOP_RADIUS_KM);
  });

  it('keeps a short trip down to a handful of requests', () => {
    // Not the minimum possible (one wide circle would reach the whole hop),
    // because the planner deliberately prefers several small circles: each
    // Wallapop page is capped, so tighter circles recall more of the corridor.
    const plan = planCorridor(SHORT_HOP, 10);
    expect(plan.centers.length).toBeLessThanOrEqual(6);
  });
});

describe('planCorridor centre placement', () => {
  it('starts at the origin and ends at the destination', () => {
    const plan = planCorridor(LA_CORONADA_TO_MADRID, 5);
    const first = plan.centers[0];
    const last = plan.centers[plan.centers.length - 1];
    expect(haversineKm(first, LA_CORONADA_TO_MADRID[0])).toBeLessThan(0.01);
    expect(haversineKm(last, LA_CORONADA_TO_MADRID[LA_CORONADA_TO_MADRID.length - 1])).toBeLessThan(
      0.01,
    );
  });

  it('spaces centres by no more than the planned spacing', () => {
    // This test route is deliberately coarse (legs of tens of km), which is
    // the worst case for the degree-space interpolation in samplePointsAlong.
    // The planner's safety factor must still keep real spacing under plan.
    const plan = planCorridor(LA_CORONADA_TO_MADRID, 5);
    for (let i = 1; i < plan.centers.length; i++) {
      expect(haversineKm(plan.centers[i - 1], plan.centers[i])).toBeLessThanOrEqual(
        plan.spacingKm,
      );
    }
  });

  it('needs more centres for a longer route at the same detour', () => {
    const short = planCorridor(SHORT_HOP, 5);
    const long = planCorridor(LA_CORONADA_TO_MADRID, 5);
    expect(polylineLengthKm(LA_CORONADA_TO_MADRID)).toBeGreaterThan(polylineLengthKm(SHORT_HOP));
    expect(long.centers.length).toBeGreaterThan(short.centers.length);
  });

  it('handles a degenerate single-point route', () => {
    const plan = planCorridor([{ lat: 40.4168, lng: -3.7038 }], 5);
    expect(plan.centers).toHaveLength(1);
    expect(plan.fullCoverage).toBe(true);
  });
});

describe('planCorridor input validation', () => {
  it('rejects an empty route', () => {
    expect(() => planCorridor([], 5)).toThrow(/empty/);
  });

  it('rejects a non-positive detour', () => {
    expect(() => planCorridor(LA_CORONADA_TO_MADRID, 0)).toThrow(/maxDetourKm/);
    expect(() => planCorridor(LA_CORONADA_TO_MADRID, -3)).toThrow(/maxDetourKm/);
  });

  it('echoes the requested detour back for traceability', () => {
    expect(planCorridor(LA_CORONADA_TO_MADRID, 7).maxDetourKm).toBe(7);
  });
});
