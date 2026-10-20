import { describe, it, expect } from 'vitest';
import {
  estimateDurationSeconds,
  haversineMatrix,
  haversineMeters,
  pathLengthMeters,
} from './geo';

const madrid = { lat: 40.4168, lng: -3.7038 };
const barcelona = { lat: 41.3874, lng: 2.1686 };

describe('haversineMeters', () => {
  it('is zero for identical points', () => {
    expect(haversineMeters(madrid, madrid)).toBe(0);
  });

  it('matches the known Madrid-Barcelona distance (~505 km)', () => {
    const km = haversineMeters(madrid, barcelona) / 1000;
    expect(km).toBeGreaterThan(502);
    expect(km).toBeLessThan(508);
  });

  it('is symmetric', () => {
    expect(haversineMeters(madrid, barcelona)).toBeCloseTo(haversineMeters(barcelona, madrid), 6);
  });

  it('handles the antimeridian', () => {
    const d = haversineMeters({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 });
    expect(d).toBeLessThan(25_000);
  });

  it('measures one degree of latitude as ~111 km', () => {
    const d = haversineMeters({ lat: 10, lng: 20 }, { lat: 11, lng: 20 });
    expect(d / 1000).toBeGreaterThan(110.5);
    expect(d / 1000).toBeLessThan(111.8);
  });
});

describe('estimateDurationSeconds', () => {
  it('estimates a slower trip on foot than by bike than by car', () => {
    const car = estimateDurationSeconds(10_000, 'driving');
    const bike = estimateDurationSeconds(10_000, 'bike');
    const foot = estimateDurationSeconds(10_000, 'foot');
    expect(foot).toBeGreaterThan(bike);
    expect(bike).toBeGreaterThan(car);
  });

  it('is zero for zero distance', () => {
    expect(estimateDurationSeconds(0, 'driving')).toBe(0);
  });
});

describe('pathLengthMeters / haversineMatrix', () => {
  it('sums consecutive legs', () => {
    const mid = { lat: 40.9, lng: -0.8 };
    const total = pathLengthMeters([madrid, mid, barcelona]);
    expect(total).toBeCloseTo(haversineMeters(madrid, mid) + haversineMeters(mid, barcelona), 6);
  });

  it('returns 0 for fewer than two points', () => {
    expect(pathLengthMeters([madrid])).toBe(0);
    expect(pathLengthMeters([])).toBe(0);
  });

  it('builds a symmetric matrix with a zero diagonal', () => {
    const m = haversineMatrix([madrid, barcelona]);
    expect(m[0][0]).toBe(0);
    expect(m[1][1]).toBe(0);
    expect(m[0][1]).toBe(m[1][0]);
    expect(m[0][1]).toBeGreaterThan(500_000);
  });
});
