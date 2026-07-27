import keycloak from './keycloak';
import type { Busqueda, BusquedaFormData, BusquedaUpdateData, ScraperState } from '../types';

const BASE = '/ofertas/api';

function headers(): Record<string, string> {
  const token = keycloak.token;
  if (!token) throw new Error('No auth token');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function handleError(res: Response): Promise<never> {
  let msg = `Error ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) msg = body.error;
  } catch { /* ignore */ }
  throw new Error(msg);
}

export async function getSearches(): Promise<Busqueda[]> {
  const res = await fetch(`${BASE}/searches`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Busqueda[]>;
}

export async function createSearch(data: BusquedaFormData): Promise<Busqueda> {
  const res = await fetch(`${BASE}/searches`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Busqueda>;
}

export async function updateSearch(id: string, data: BusquedaUpdateData): Promise<Busqueda> {
  const res = await fetch(`${BASE}/searches/${id}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Busqueda>;
}

export async function deleteSearch(id: string): Promise<void> {
  const res = await fetch(`${BASE}/searches/${id}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok && res.status !== 204) await handleError(res);
}

export async function getScraperState(): Promise<ScraperState> {
  const res = await fetch(`${BASE}/scraper/state`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<ScraperState>;
}

export async function updateScraperState(running: boolean): Promise<ScraperState> {
  const res = await fetch(`${BASE}/scraper/state`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ running }),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<ScraperState>;
}
