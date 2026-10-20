export const PLACE_TYPES = ['alojamiento', 'interes', 'comida', 'otro'] as const;
export type PlaceType = (typeof PLACE_TYPES)[number];

/** A place as the API exposes it (camelCase, dates as YYYY-MM-DD, time as HH:MM). */
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
  /** Visit date for non-lodging places. */
  visitDate: string | null;
  startTime: string | null;
  durationMin: number | null;
  /** Lodging stay window; check-out is the (exclusive) departure date. */
  checkIn: string | null;
  checkOut: string | null;
  visited: boolean;
  dayOrder: number;
}

export interface Trip {
  id: string;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}
