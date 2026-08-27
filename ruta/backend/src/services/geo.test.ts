import { describe, it, expect } from 'vitest';
import {
  haversineKm,
  distanceToSegmentKm,
  distanceToPolylineKm,
  polylineLengthKm,
  samplePointsAlong,
  simplifyPolyline,
  cumulativeDistancesKm,
  type LatLng,
} from './geo';

const MADRID: LatLng = { lat: 40.4168, lng: -3.7038 };
const BADAJOZ: LatLng = { lat: 38.8794, lng: -6.9707 };

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm(MADRID, MADRID)).toBe(0);
  });

  it('matches the known Madrid-Badajoz great-circle distance', () => {
    // ~327.8 km as the crow flies; a 1 km band absorbs the Earth-radius choice.
    expect(haversineKm(MADRID, BADAJOZ)).toBeGreaterThan(327);
    expect(haversineKm(MADRID, BADAJOZ)).toBeLessThan(329);
  });

  it('is symmetric', () => {
    expect(haversineKm(MADRID, BADAJOZ)).toBeCloseTo(haversineKm(BADAJOZ, MADRID), 9);
  });

  it('measures one degree of latitude as ~111 km', () => {
    expect(haversineKm({ lat: 40, lng: 0 }, { lat: 41, lng: 0 })).toBeCloseTo(111.19, 1);
  });
});

describe('distanceToSegmentKm', () => {
  const a: LatLng = { lat: 40.0, lng: -3.0 };
  const b: LatLng = { lat: 40.0, lng: -2.0 };

  it('returns zero on the segment itself', () => {
    expect(distanceToSegmentKm({ lat: 40.0, lng: -2.5 }, a, b).distanceKm).toBeLessThan(0.001);
  });

  it('clamps past the start instead of extending the line', () => {
    // Due west of `a`: the nearest point is `a`, not an extrapolated line.
    const result = distanceToSegmentKm({ lat: 40.0, lng: -4.0 }, a, b);
    expect(result.t).toBe(0);
    expect(result.distanceKm).toBeCloseTo(haversineKm({ lat: 40.0, lng: -4.0 }, a), 1);
  });

  it('clamps past the end instead of extending the line', () => {
    const result = distanceToSegmentKm({ lat: 40.0, lng: -1.0 }, a, b);
    expect(result.t).toBe(1);
    expect(result.distanceKm).toBeCloseTo(haversineKm({ lat: 40.0, lng: -1.0 }, b), 1);
  });

  it('measures perpendicular offset from the midpoint', () => {
    // 0.1 degrees of latitude north of the segment midpoint is ~11.1 km.
    const result = distanceToSegmentKm({ lat: 40.1, lng: -2.5 }, a, b);
    expect(result.distanceKm).toBeCloseTo(11.12, 1);
    expect(result.t).toBeCloseTo(0.5, 2);
  });

  it('handles a degenerate zero-length segment', () => {
    const result = distanceToSegmentKm({ lat: 40.1, lng: -3.0 }, a, a);
    expect(result.distanceKm).toBeCloseTo(11.12, 1);
    expect(result.t).toBe(0);
  });
});

describe('distanceToPolylineKm', () => {
  // An L-shape: east along 40N, then north along 2W.
  const polyline: LatLng[] = [
    { lat: 40.0, lng: -3.0 },
    { lat: 40.0, lng: -2.0 },
    { lat: 41.0, lng: -2.0 },
  ];

  it('reports the nearest leg, not the first one', () => {
    const near = distanceToPolylineKm({ lat: 40.9, lng: -2.05 }, polyline);
    expect(near.distanceKm).toBeLessThan(5);
  });

  it('reports how far along the route the closest approach is', () => {
    const cum = cumulativeDistancesKm(polyline);
    const atStart = distanceToPolylineKm({ lat: 40.0, lng: -3.0 }, polyline);
    expect(atStart.alongKm).toBeCloseTo(0, 3);

    const atEnd = distanceToPolylineKm({ lat: 41.0, lng: -2.0 }, polyline);
    expect(atEnd.alongKm).toBeCloseTo(cum[cum.length - 1], 3);
  });

  it('orders two listings by travel order, not by raw distance', () => {
    const early = distanceToPolylineKm({ lat: 40.02, lng: -2.8 }, polyline);
    const late = distanceToPolylineKm({ lat: 40.8, lng: -2.02 }, polyline);
    expect(early.alongKm).toBeLessThan(late.alongKm);
  });

  it('accepts a precomputed cumulative array and agrees with the internal one', () => {
    const point = { lat: 40.5, lng: -2.3 };
    const withCache = distanceToPolylineKm(point, polyline, cumulativeDistancesKm(polyline));
    const without = distanceToPolylineKm(point, polyline);
    expect(withCache.distanceKm).toBeCloseTo(without.distanceKm, 9);
    expect(withCache.alongKm).toBeCloseTo(without.alongKm, 9);
  });

  it('falls back to plain distance for a single-vertex polyline', () => {
    const result = distanceToPolylineKm(MADRID, [BADAJOZ]);
    expect(result.distanceKm).toBeCloseTo(haversineKm(MADRID, BADAJOZ), 6);
    expect(result.alongKm).toBe(0);
  });

  it('throws on an empty polyline rather than returning a bogus distance', () => {
    expect(() => distanceToPolylineKm(MADRID, [])).toThrow(/empty/);
  });
});

describe('samplePointsAlong', () => {
  const straight: LatLng[] = [
    { lat: 40.0, lng: -3.0 },
    { lat: 40.0, lng: -2.0 },
  ];

  it('always includes both endpoints', () => {
    const samples = samplePointsAlong(straight, 10);
    expect(samples[0].lng).toBeCloseTo(-3.0, 6);
    expect(samples[samples.length - 1].lng).toBeCloseTo(-2.0, 6);
  });

  it('never leaves a gap wider than the requested spacing', () => {
    const spacing = 7;
    // Samples are interpolated linearly in degrees between polyline vertices,
    // so a step measured by haversine can overshoot the requested arc length
    // by a few centimetres. One metre of tolerance covers that without hiding
    // a real spacing bug; `planCorridor` absorbs it with a safety factor.
    const TOLERANCE_KM = 0.001;
    const samples = samplePointsAlong(straight, spacing);
    for (let i = 1; i < samples.length; i++) {
      expect(haversineKm(samples[i - 1], samples[i])).toBeLessThanOrEqual(spacing + TOLERANCE_KM);
    }
  });

  it('covers the tail when the length is not a multiple of the spacing', () => {
    const total = polylineLengthKm(straight);
    const samples = samplePointsAlong(straight, total / 2.5);
    const last = samples[samples.length - 1];
    expect(haversineKm(last, straight[1])).toBeLessThan(1e-6);
  });

  it('returns a single point for a zero-length polyline', () => {
    const degenerate = [MADRID, MADRID];
    expect(samplePointsAlong(degenerate, 5)).toHaveLength(1);
  });

  it('rejects a non-positive spacing instead of looping forever', () => {
    expect(() => samplePointsAlong(straight, 0)).toThrow(/spacingKm/);
  });
});

describe('simplifyPolyline', () => {
  it('drops collinear intermediate vertices', () => {
    const line: LatLng[] = [
      { lat: 40.0, lng: -3.0 },
      { lat: 40.0, lng: -2.75 },
      { lat: 40.0, lng: -2.5 },
      { lat: 40.0, lng: -2.25 },
      { lat: 40.0, lng: -2.0 },
    ];
    expect(simplifyPolyline(line, 0.2)).toHaveLength(2);
  });

  it('keeps a vertex that deviates by more than the tolerance', () => {
    const detour: LatLng[] = [
      { lat: 40.0, lng: -3.0 },
      { lat: 40.5, lng: -2.5 },
      { lat: 40.0, lng: -2.0 },
    ];
    expect(simplifyPolyline(detour, 0.2)).toHaveLength(3);
  });

  it('never moves the route by more than the tolerance', () => {
    const wiggly: LatLng[] = Array.from({ length: 200 }, (_, i) => ({
      lat: 40 + Math.sin(i / 7) * 0.01,
      lng: -3 + i * 0.005,
    }));
    const simplified = simplifyPolyline(wiggly, 0.5);

    expect(simplified.length).toBeLessThan(wiggly.length);
    for (const original of wiggly) {
      expect(distanceToPolylineKm(original, simplified).distanceKm).toBeLessThanOrEqual(0.5 + 1e-6);
    }
  });

  it('preserves both endpoints', () => {
    const wiggly: LatLng[] = Array.from({ length: 50 }, (_, i) => ({
      lat: 40 + Math.sin(i) * 0.02,
      lng: -3 + i * 0.01,
    }));
    const simplified = simplifyPolyline(wiggly, 1);
    expect(simplified[0]).toEqual(wiggly[0]);
    expect(simplified[simplified.length - 1]).toEqual(wiggly[wiggly.length - 1]);
  });

  it('handles a stack-unfriendly long polyline without throwing', () => {
    const long: LatLng[] = Array.from({ length: 20000 }, (_, i) => ({
      lat: 40 + Math.sin(i / 3) * 0.5,
      lng: -3 + i * 0.0005,
    }));
    expect(() => simplifyPolyline(long, 0.05)).not.toThrow();
  });
});
