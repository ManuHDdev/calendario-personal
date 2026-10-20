import { haversineMeters } from './geo';
import { groupByDay } from './itinerary';
import { PLACE_TYPES, type Place, type PlaceType } from './types';

export interface TripSummary {
  totalPlaces: number;
  countsByType: Record<PlaceType, number>;
  visited: number;
  scheduled: number;
  unscheduled: number;
  days: number;
  totalCost: number;
  /** Straight-line km along each day's visit order (road totals live in the itinerary). */
  straightLineKm: number;
}

/** Cheap, network-free trip summary. */
export function summarizeTrip(places: Place[]): TripSummary {
  const countsByType = Object.fromEntries(PLACE_TYPES.map((t) => [t, 0])) as Record<PlaceType, number>;
  let visited = 0;
  let totalCost = 0;
  for (const p of places) {
    countsByType[p.type] += 1;
    if (p.visited) visited += 1;
    if (p.cost != null) totalCost += p.cost;
  }

  const { days, unscheduled } = groupByDay(places);
  let scheduled = 0;
  let meters = 0;
  for (const stops of days.values()) {
    scheduled += stops.length;
    for (let i = 1; i < stops.length; i++) meters += haversineMeters(stops[i - 1], stops[i]);
  }

  return {
    totalPlaces: places.length,
    countsByType,
    visited,
    scheduled,
    unscheduled: unscheduled.length,
    days: days.size,
    totalCost: Math.round(totalCost * 100) / 100,
    straightLineKm: Math.round(meters / 100) / 10,
  };
}
