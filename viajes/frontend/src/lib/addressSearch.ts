import type { GeocodeHit, PlaceType } from '../types';

export interface MapBounds {
  west: number;
  north: number;
  east: number;
  south: number;
}

/** Nominatim viewbox order: left,top,right,bottom. Clamped so the backend never rejects a world-wide view. */
export function formatViewbox(b: MapBounds): string | null {
  const west = Math.max(-180, b.west);
  const east = Math.min(180, b.east);
  const south = Math.max(-90, b.south);
  const north = Math.min(90, b.north);
  if (![west, east, south, north].every(Number.isFinite) || west >= east || south >= north) return null;
  const r = (n: number) => String(Math.round(n * 1e4) / 1e4);
  return [west, north, east, south].map(r).join(',');
}

/** POI name of a hit; legacy hits (only displayName) fall back to the first address segment. */
export function hitName(hit: GeocodeHit): string {
  return hit.name?.trim() || hit.displayName.split(',')[0].trim();
}

/** Second line of a result row: the locality, or the rest of the address for legacy hits. */
export function hitSubtitle(hit: GeocodeHit): string {
  if (hit.locality) return hit.locality;
  const rest = hit.displayName.split(',').slice(1).join(',').trim();
  return rest;
}

/** Place type to use for a hit; unknown/legacy hits are "otro". */
export function hitKind(hit: GeocodeHit): PlaceType {
  return hit.kind ?? 'otro';
}

export type ListKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

/** Next highlighted index for a listbox of `length` items; -1 means "none". Wraps around. */
export function nextIndex(current: number, key: ListKey, length: number): number {
  if (length <= 0) return -1;
  switch (key) {
    case 'ArrowDown':
      return current < 0 || current >= length - 1 ? 0 : current + 1;
    case 'ArrowUp':
      return current <= 0 ? length - 1 : current - 1;
    case 'Home':
      return 0;
    case 'End':
      return length - 1;
  }
}
