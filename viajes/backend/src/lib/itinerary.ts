import { haversineMeters, type Profile } from './geo';
import type { RouteResult } from './routing';
import type { Place } from './types';

/** Function that routes through ordered points; injected so itinerary logic is testable. */
export type RouteThroughFn = (
  points: Array<{ lat: number; lng: number }>,
  profile: Profile,
) => Promise<RouteResult>;

export interface ItineraryLeg {
  fromId: string;
  toId: string;
  distanceM: number;
  durationS: number;
}

export interface ItineraryDay {
  date: string;
  /** Places visited that day, in visit order (lodging excluded). */
  stops: Place[];
  /** Lodging the group sleeps in that night (used as day start/end), if any. */
  lodging: Place | null;
  legs: ItineraryLeg[];
  geometry: Array<[number, number]>;
  totalDistanceM: number;
  totalDurationS: number;
  approx: boolean;
}

export interface Itinerary {
  profile: Profile;
  days: ItineraryDay[];
  unscheduled: Place[];
}

/** Order inside a day: explicit dayOrder, then start time (untimed last), then name. */
export function compareWithinDay(a: Place, b: Place): number {
  if (a.dayOrder !== b.dayOrder) return a.dayOrder - b.dayOrder;
  if (a.startTime && b.startTime) {
    if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
  } else if (a.startTime || b.startTime) {
    return a.startTime ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}

/** Lodging whose stay covers the night of `date` (check-in <= date < check-out). */
export function lodgingForDate(lodgings: Place[], date: string): Place | null {
  const matches = lodgings.filter((l) => {
    if (!l.checkIn) return false;
    if (date < l.checkIn) return false;
    // Without a check-out the stay is open-ended.
    return !l.checkOut || date < l.checkOut;
  });
  if (matches.length === 0) return null;
  // The latest check-in wins when stays overlap.
  return matches.sort((a, b) => (b.checkIn ?? '').localeCompare(a.checkIn ?? ''))[0];
}

/** Groups scheduled (non-lodging, dated) places by day and splits out the pending ones. */
export function groupByDay(places: Place[]): { days: Map<string, Place[]>; unscheduled: Place[] } {
  const days = new Map<string, Place[]>();
  const unscheduled: Place[] = [];
  for (const p of places) {
    if (p.type === 'alojamiento') continue;
    if (!p.visitDate) {
      unscheduled.push(p);
      continue;
    }
    const list = days.get(p.visitDate) ?? [];
    list.push(p);
    days.set(p.visitDate, list);
  }
  for (const list of days.values()) list.sort(compareWithinDay);
  return { days, unscheduled };
}

export interface ItineraryOptions {
  profile: Profile;
  /** Start the day at that night's lodging (and come back to it when `roundTrip`). */
  withLodging: boolean;
  roundTrip: boolean;
}

export async function buildItinerary(
  places: Place[],
  route: RouteThroughFn,
  options: ItineraryOptions,
): Promise<Itinerary> {
  const lodgings = places.filter((p) => p.type === 'alojamiento');
  const { days, unscheduled } = groupByDay(places);
  const dates = [...days.keys()].sort();

  const result: ItineraryDay[] = [];
  for (const date of dates) {
    const stops = days.get(date) ?? [];
    const lodging = options.withLodging ? lodgingForDate(lodgings, date) : null;

    const waypoints: Place[] = [];
    if (lodging) waypoints.push(lodging);
    waypoints.push(...stops);
    if (lodging && options.roundTrip && stops.length > 0) waypoints.push(lodging);

    const routed = await route(
      waypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
      options.profile,
    );
    const legs: ItineraryLeg[] = routed.legs.map((leg, i) => ({
      fromId: waypoints[i].id,
      toId: waypoints[i + 1].id,
      distanceM: leg.distanceM,
      durationS: leg.durationS,
    }));

    result.push({
      date,
      stops,
      lodging,
      legs,
      geometry: routed.geometry,
      totalDistanceM: routed.totalDistanceM,
      totalDurationS: routed.totalDurationS,
      approx: routed.approx,
    });
  }
  return { profile: options.profile, days: result, unscheduled };
}

export interface NearestLodging {
  lodging: Place;
  straightM: number;
  /** True when the lodging's stay covers the POI's visit date. */
  coversVisitDate: boolean;
}

/** Lodgings ranked by straight-line distance to a place (covering ones first on ties of relevance). */
export function nearestLodgings(poi: Place, lodgings: Place[]): NearestLodging[] {
  return lodgings
    .filter((l) => l.type === 'alojamiento' && l.id !== poi.id)
    .map((lodging) => ({
      lodging,
      straightM: Math.round(haversineMeters(poi, lodging)),
      coversVisitDate: poi.visitDate ? lodgingForDate([lodging], poi.visitDate) !== null : false,
    }))
    .sort((a, b) => a.straightM - b.straightM);
}
