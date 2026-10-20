import keycloak from './keycloak';
import type {
  DistanceResult,
  GeocodeHit,
  Itinerary,
  MatrixResponse,
  NearestLodging,
  Place,
  PlaceInput,
  Profile,
  Trip,
  TripDetail,
  TripSummary,
  TripSummaryItem,
} from '../types';

const BASE = '/viajes/api';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function authHeaders(json = false): Promise<Record<string, string>> {
  // Refresh shortly before expiry so long-lived tabs keep working.
  await keycloak.updateToken(30).catch(() => keycloak.login());
  const headers: Record<string, string> = { Authorization: `Bearer ${keycloak.token}` };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function fail(res: Response): Promise<never> {
  let msg = `Error ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    msg = body.message ?? body.error ?? msg;
  } catch {
    /* body is not JSON */
  }
  throw new ApiError(res.status, msg);
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: await authHeaders(init.body !== undefined),
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) await fail(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const qs = (params: Record<string, string | number | boolean>): string =>
  new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();

// ── Trips ────────────────────────────────────────────────────────────────────
export const listTrips = () => request<TripSummaryItem[]>('/trips');
export const getTrip = (id: string) => request<TripDetail>(`/trips/${id}`);
export const createTrip = (data: { name: string; description?: string | null; startDate?: string | null; endDate?: string | null }) =>
  request<Trip>('/trips', { method: 'POST', body: data });
export const updateTrip = (id: string, data: Partial<Omit<Trip, 'id'>>) =>
  request<Trip>(`/trips/${id}`, { method: 'PATCH', body: data });
export const deleteTrip = (id: string) => request<void>(`/trips/${id}`, { method: 'DELETE' });

// ── Places ───────────────────────────────────────────────────────────────────
export const createPlace = (tripId: string, data: PlaceInput) =>
  request<Place>(`/trips/${tripId}/places`, { method: 'POST', body: data });
export const updatePlace = (tripId: string, placeId: string, data: Partial<PlaceInput>) =>
  request<Place>(`/trips/${tripId}/places/${placeId}`, { method: 'PATCH', body: data });
export const deletePlace = (tripId: string, placeId: string) =>
  request<void>(`/trips/${tripId}/places/${placeId}`, { method: 'DELETE' });
export const reorderPlaces = (tripId: string, date: string | null, placeIds: string[]) =>
  request<{ places: Place[] }>(`/trips/${tripId}/reorder`, { method: 'POST', body: { date, placeIds } });

// ── Itinerary, distances, summary ────────────────────────────────────────────
export const getItinerary = (tripId: string, profile: Profile, withLodging: boolean) =>
  request<Itinerary>(`/trips/${tripId}/itinerary?${qs({ profile, withLodging, roundTrip: withLodging })}`);
export const getSummary = (tripId: string) => request<TripSummary>(`/trips/${tripId}/summary`);
export const getTripDistance = (tripId: string, from: string, to: string, profile: Profile) =>
  request<DistanceResult>(`/trips/${tripId}/distance?${qs({ from, to, profile })}`);
export const getDistanceMatrix = (tripId: string, ids: string[], profile: Profile, road: boolean) =>
  request<MatrixResponse>(`/trips/${tripId}/distance-matrix?${qs({ ids: ids.join(','), profile, road })}`);
export const getNearestLodging = (tripId: string, placeId: string, profile: Profile, road: boolean) =>
  request<{ lodgings: NearestLodging[] }>(
    `/trips/${tripId}/places/${placeId}/nearest-lodging?${qs({ profile, road })}`,
  );

// ── Geocoding ────────────────────────────────────────────────────────────────
export const searchAddress = (q: string) =>
  request<{ results: GeocodeHit[] }>(`/geocode/search?${qs({ q })}`).then((r) => r.results);
export const reverseGeocode = (lat: number, lng: number) =>
  request<{ result: GeocodeHit | null }>(`/geocode/reverse?${qs({ lat, lng })}`).then((r) => r.result);

// ── Exports (authenticated download) ─────────────────────────────────────────
export async function downloadExport(tripId: string, kind: 'gpx' | 'ics', filename: string): Promise<void> {
  const res = await fetch(`${BASE}/trips/${tripId}/export.${kind}`, { headers: await authHeaders() });
  if (!res.ok) await fail(res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.${kind}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
