import type { Place } from './types';

let counter = 0;

/** Test helper: a valid place with overridable fields (Mérida-ish coordinates by default). */
export function makePlace(overrides: Partial<Place> = {}): Place {
  counter += 1;
  return {
    id: overrides.id ?? `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    tripId: '11111111-1111-4111-8111-111111111111',
    type: 'interes',
    name: `Place ${counter}`,
    lat: 38.9,
    lng: -6.34,
    address: null,
    notes: null,
    url: null,
    cost: null,
    visitDate: null,
    startTime: null,
    durationMin: null,
    checkIn: null,
    checkOut: null,
    visited: false,
    dayOrder: 0,
    ...overrides,
  };
}
