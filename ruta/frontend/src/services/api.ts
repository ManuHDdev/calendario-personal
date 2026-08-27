import keycloak from './keycloak';
import type {
  GeocodeResult,
  RouteSearchRequest,
  RouteSearchResult,
  SavedRouteSearch,
  SavedRouteSearchCreateData,
} from '../types';

const BASE = '/ruta/api';

function authHeaders(): Record<string, string> {
  const token = keycloak.token;
  if (!token) throw new Error('No hay sesion iniciada');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function handleError(res: Response): Promise<never> {
  let msg = `Error ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) msg = body.error;
  } catch {
    /* the body was not JSON; the status-code message stands */
  }
  throw new Error(msg);
}

export async function geocode(query: string): Promise<GeocodeResult> {
  const res = await fetch(`${BASE}/geocode?q=${encodeURIComponent(query)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<GeocodeResult>;
}

export async function searchAlongRoute(body: RouteSearchRequest): Promise<RouteSearchResult> {
  const res = await fetch(`${BASE}/search`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<RouteSearchResult>;
}

export async function getSavedSearches(): Promise<SavedRouteSearch[]> {
  const res = await fetch(`${BASE}/searches`, { headers: authHeaders() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<SavedRouteSearch[]>;
}

export async function createSavedSearch(
  data: SavedRouteSearchCreateData,
): Promise<SavedRouteSearch> {
  const res = await fetch(`${BASE}/searches`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<SavedRouteSearch>;
}

export async function deleteSavedSearch(id: number): Promise<void> {
  const res = await fetch(`${BASE}/searches/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 204) await handleError(res);
}
