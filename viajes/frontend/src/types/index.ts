export type PlaceType = 'alojamiento' | 'interes' | 'comida' | 'otro';
export type Profile = 'driving' | 'foot' | 'bike';

export interface Place {
  id: string;
  tripId: string;
  type: PlaceType;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  notes: string | null;
  url: string | null;
  cost: number | null;
  visitDate: string | null;
  startTime: string | null;
  durationMin: number | null;
  checkIn: string | null;
  checkOut: string | null;
  visited: boolean;
  dayOrder: number;
}

export interface TripSummaryItem {
  id: string;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  placeCount: number;
}

export interface Trip {
  id: string;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface TripDetail extends Trip {
  places: Place[];
}

/** Body for creating/updating a place (same names as the API). */
export interface PlaceInput {
  type: PlaceType;
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
  notes?: string | null;
  url?: string | null;
  cost?: number | null;
  visitDate?: string | null;
  startTime?: string | null;
  durationMin?: number | null;
  checkIn?: string | null;
  checkOut?: string | null;
  visited?: boolean;
}

export interface GeocodeHit {
  lat: number;
  lng: number;
  displayName: string;
}

export interface ItineraryLeg {
  fromId: string;
  toId: string;
  distanceM: number;
  durationS: number;
}

export interface ItineraryDay {
  date: string;
  stops: Place[];
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

export interface DistanceResult {
  profile: Profile;
  straightM: number;
  distanceM: number;
  durationS: number;
  approx: boolean;
  geometry: Array<[number, number]>;
}

export interface MatrixResponse {
  profile: Profile;
  places: Array<{ id: string; name: string; type: PlaceType }>;
  straightM: number[][];
  road: { distancesM: number[][]; durationsS: number[][]; approx: boolean } | null;
}

export interface NearestLodging {
  lodging: Place;
  straightM: number;
  coversVisitDate: boolean;
  road: { distanceM: number; durationS: number; approx: boolean } | null;
}

export interface TripSummary {
  totalPlaces: number;
  countsByType: Record<PlaceType, number>;
  visited: number;
  scheduled: number;
  unscheduled: number;
  days: number;
  totalCost: number;
  straightLineKm: number;
}
