import type { Place } from '../types';

export interface DayGroup {
  date: string;
  places: Place[];
}

export interface PlaceGroups {
  lodgings: Place[];
  days: DayGroup[];
  pending: Place[];
}

/** Same ordering as the backend: dayOrder, then start time (untimed last), then name. */
export function compareWithinDay(a: Place, b: Place): number {
  if (a.dayOrder !== b.dayOrder) return a.dayOrder - b.dayOrder;
  if (a.startTime && b.startTime) {
    if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
  } else if (a.startTime || b.startTime) {
    return a.startTime ? -1 : 1;
  }
  return a.name.localeCompare(b.name, 'es');
}

/** Splits places into lodgings (by check-in), days (sorted by date) and the pending list. */
export function groupPlaces(places: Place[]): PlaceGroups {
  const lodgings = places
    .filter((p) => p.type === 'alojamiento')
    .sort((a, b) => (a.checkIn ?? '9999').localeCompare(b.checkIn ?? '9999') || a.name.localeCompare(b.name, 'es'));

  const byDate = new Map<string, Place[]>();
  const pending: Place[] = [];
  for (const p of places) {
    if (p.type === 'alojamiento') continue;
    if (!p.visitDate) {
      pending.push(p);
      continue;
    }
    byDate.set(p.visitDate, [...(byDate.get(p.visitDate) ?? []), p]);
  }

  const days = [...byDate.keys()]
    .sort()
    .map((date) => ({ date, places: (byDate.get(date) ?? []).sort(compareWithinDay) }));
  return { lodgings, days, pending: pending.sort(compareWithinDay) };
}

export interface ReorderRequest {
  /** Target day, or null for the pending list. */
  date: string | null;
  /** Full ordered id list of that day after the move. */
  placeIds: string[];
}

function listFor(groups: PlaceGroups, date: string | null): Place[] {
  return date === null ? groups.pending : (groups.days.find((d) => d.date === date)?.places ?? []);
}

/**
 * Drag-and-drop: moves `placeId` into `targetDate` (null = pending), right before
 * `beforeId` (null = at the end). Lodging cannot be reordered.
 */
export function computeReorder(
  groups: PlaceGroups,
  placeId: string,
  targetDate: string | null,
  beforeId: string | null,
): ReorderRequest | null {
  const all = [...groups.pending, ...groups.days.flatMap((d) => d.places)];
  if (!all.some((p) => p.id === placeId)) return null;

  const ids = listFor(groups, targetDate)
    .map((p) => p.id)
    .filter((id) => id !== placeId);
  const at = beforeId === null ? -1 : ids.indexOf(beforeId);
  if (at === -1) ids.push(placeId);
  else ids.splice(at, 0, placeId);
  return { date: targetDate, placeIds: ids };
}

/** Up/down buttons: swaps with the neighbour inside the same list. */
export function computeMove(groups: PlaceGroups, placeId: string, offset: -1 | 1): ReorderRequest | null {
  const lists: Array<{ date: string | null; places: Place[] }> = [
    { date: null, places: groups.pending },
    ...groups.days,
  ];
  for (const list of lists) {
    const idx = list.places.findIndex((p) => p.id === placeId);
    if (idx === -1) continue;
    const to = idx + offset;
    if (to < 0 || to >= list.places.length) return null;
    const ids = list.places.map((p) => p.id);
    [ids[idx], ids[to]] = [ids[to], ids[idx]];
    return { date: list.date, placeIds: ids };
  }
  return null;
}
