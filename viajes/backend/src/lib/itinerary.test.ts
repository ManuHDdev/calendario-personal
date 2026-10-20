import { describe, it, expect } from 'vitest';
import {
  buildItinerary,
  compareWithinDay,
  groupByDay,
  lodgingForDate,
  nearestLodgings,
  type RouteThroughFn,
} from './itinerary';
import { fallbackRoute } from './routing';
import { haversineMeters } from './geo';
import { makePlace } from './place.fixture';

const hotelA = makePlace({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  type: 'alojamiento',
  name: 'Hotel A',
  lat: 38.9,
  lng: -6.34,
  checkIn: '2026-07-01',
  checkOut: '2026-07-03',
});
const hotelB = makePlace({
  id: 'bbbbbbbb-0000-4000-8000-000000000002',
  type: 'alojamiento',
  name: 'Hotel B',
  lat: 39.2,
  lng: -6.1,
  checkIn: '2026-07-03',
  checkOut: '2026-07-05',
});

describe('lodgingForDate', () => {
  it('picks the stay covering the night (check-out day excluded)', () => {
    expect(lodgingForDate([hotelA, hotelB], '2026-07-01')?.name).toBe('Hotel A');
    expect(lodgingForDate([hotelA, hotelB], '2026-07-02')?.name).toBe('Hotel A');
    expect(lodgingForDate([hotelA, hotelB], '2026-07-03')?.name).toBe('Hotel B');
    expect(lodgingForDate([hotelA, hotelB], '2026-07-05')).toBeNull();
    expect(lodgingForDate([hotelA, hotelB], '2026-06-30')).toBeNull();
  });

  it('treats a missing check-out as open-ended and ignores lodging without check-in', () => {
    const open = makePlace({ type: 'alojamiento', name: 'Open', checkIn: '2026-07-01' });
    const noDates = makePlace({ type: 'alojamiento', name: 'NoDates' });
    expect(lodgingForDate([open], '2026-12-31')?.name).toBe('Open');
    expect(lodgingForDate([noDates], '2026-07-01')).toBeNull();
  });
});

describe('compareWithinDay / groupByDay', () => {
  it('orders by dayOrder, then start time (untimed last), then name', () => {
    const late = makePlace({ name: 'late', dayOrder: 0, startTime: '18:00' });
    const early = makePlace({ name: 'early', dayOrder: 0, startTime: '09:00' });
    const untimed = makePlace({ name: 'untimed', dayOrder: 0 });
    const manual = makePlace({ name: 'manual', dayOrder: 5, startTime: '08:00' });
    const sorted = [manual, untimed, late, early].sort(compareWithinDay).map((p) => p.name);
    expect(sorted).toEqual(['early', 'late', 'untimed', 'manual']);
  });

  it('splits scheduled days from the unscheduled list and drops lodging', () => {
    const p1 = makePlace({ name: 'p1', visitDate: '2026-07-02' });
    const p2 = makePlace({ name: 'p2', visitDate: '2026-07-01' });
    const pending = makePlace({ name: 'pending' });
    const { days, unscheduled } = groupByDay([p1, p2, pending, hotelA]);
    expect([...days.keys()].sort()).toEqual(['2026-07-01', '2026-07-02']);
    expect(unscheduled.map((p) => p.name)).toEqual(['pending']);
  });
});

describe('buildItinerary', () => {
  // Deterministic router: straight lines, no network.
  const router: RouteThroughFn = async (points, profile) => fallbackRoute(points, profile);

  const day1a = makePlace({ name: 'Museum', visitDate: '2026-07-01', dayOrder: 0, lat: 38.92, lng: -6.34 });
  const day1b = makePlace({ name: 'Castle', visitDate: '2026-07-01', dayOrder: 1, lat: 38.95, lng: -6.3 });
  const day3 = makePlace({ name: 'Bridge', visitDate: '2026-07-03', lat: 39.21, lng: -6.12 });
  const pending = makePlace({ name: 'Maybe' });

  it('starts and ends each day at that night lodging and totals the legs', async () => {
    const it = await buildItinerary([hotelA, hotelB, day1b, day1a, day3, pending], router, {
      profile: 'driving',
      withLodging: true,
      roundTrip: true,
    });

    expect(it.days.map((d) => d.date)).toEqual(['2026-07-01', '2026-07-03']);
    expect(it.unscheduled.map((p) => p.name)).toEqual(['Maybe']);

    const d1 = it.days[0];
    expect(d1.stops.map((s) => s.name)).toEqual(['Museum', 'Castle']);
    expect(d1.lodging?.name).toBe('Hotel A');
    // hotel -> museum -> castle -> hotel
    expect(d1.legs.map((l) => [l.fromId, l.toId])).toEqual([
      [hotelA.id, day1a.id],
      [day1a.id, day1b.id],
      [day1b.id, hotelA.id],
    ]);
    const expected =
      Math.round(haversineMeters(hotelA, day1a)) +
      Math.round(haversineMeters(day1a, day1b)) +
      Math.round(haversineMeters(day1b, hotelA));
    expect(d1.totalDistanceM).toBe(expected);
    expect(d1.totalDurationS).toBe(d1.legs.reduce((s, l) => s + l.durationS, 0));
    expect(d1.approx).toBe(true);

    // 3 July sleeps at Hotel B
    expect(it.days[1].lodging?.name).toBe('Hotel B');
  });

  it('can skip lodging and the return leg', async () => {
    const noLodging = await buildItinerary([hotelA, day1a, day1b], router, {
      profile: 'foot',
      withLodging: false,
      roundTrip: true,
    });
    expect(noLodging.days[0].lodging).toBeNull();
    expect(noLodging.days[0].legs).toHaveLength(1);

    const oneWay = await buildItinerary([hotelA, day1a, day1b], router, {
      profile: 'foot',
      withLodging: true,
      roundTrip: false,
    });
    expect(oneWay.days[0].legs).toHaveLength(2);
  });

  it('gives a single-stop day without lodging zero distance', async () => {
    const it = await buildItinerary([day3], router, { profile: 'driving', withLodging: true, roundTrip: true });
    expect(it.days[0].legs).toEqual([]);
    expect(it.days[0].totalDistanceM).toBe(0);
  });

  it('returns no days when nothing is scheduled', async () => {
    const it = await buildItinerary([pending, hotelA], router, { profile: 'driving', withLodging: true, roundTrip: true });
    expect(it.days).toEqual([]);
    expect(it.unscheduled).toHaveLength(1);
  });
});

describe('nearestLodgings', () => {
  it('ranks lodgings by straight-line distance and flags the one covering the visit date', () => {
    const poi = makePlace({ name: 'POI', lat: 39.19, lng: -6.12, visitDate: '2026-07-04' });
    const ranked = nearestLodgings(poi, [hotelA, hotelB, poi]);
    expect(ranked.map((r) => r.lodging.name)).toEqual(['Hotel B', 'Hotel A']);
    expect(ranked[0].straightM).toBeLessThan(ranked[1].straightM);
    expect(ranked[0].coversVisitDate).toBe(true);
    expect(ranked[1].coversVisitDate).toBe(false);
  });

  it('returns an empty list when the trip has no lodging', () => {
    expect(nearestLodgings(makePlace(), [makePlace()])).toEqual([]);
  });
});
