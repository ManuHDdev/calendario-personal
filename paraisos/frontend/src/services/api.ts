import keycloak from './keycloak';
import type { Spot, SpotCreateData, SpotUpdateData, SpotStats, SpotDetail, ParkingSpot } from '../types';

const BASE = '/paraisos/api';

function authHeaders(): Record<string, string> {
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

export async function getSpots(categoria?: string): Promise<Spot[]> {
  const params = categoria ? `?categoria=${categoria}` : '';
  const res = await fetch(`${BASE}/spots${params}`);
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Spot[]>;
}

export async function getSpot(id: number): Promise<Spot> {
  const res = await fetch(`${BASE}/spots/${id}`);
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Spot>;
}

export async function getSpotDetail(id: number): Promise<SpotDetail> {
  const res = await fetch(`${BASE}/spots/${id}`);
  if (!res.ok) await handleError(res);
  return res.json() as Promise<SpotDetail>;
}

export async function getStats(): Promise<SpotStats> {
  const res = await fetch(`${BASE}/spots/stats`);
  if (!res.ok) await handleError(res);
  return res.json() as Promise<SpotStats>;
}

export async function getRegions(): Promise<string[]> {
  const res = await fetch(`${BASE}/spots/regions`);
  if (!res.ok) await handleError(res);
  return res.json() as Promise<string[]>;
}

export async function createSpot(data: SpotCreateData): Promise<Spot> {
  const res = await fetch(`${BASE}/spots`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Spot>;
}

export async function updateSpot(id: number, data: SpotUpdateData): Promise<Spot> {
  const res = await fetch(`${BASE}/spots/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Spot>;
}

export async function deleteSpot(id: number): Promise<void> {
  const res = await fetch(`${BASE}/spots/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 204) await handleError(res);
}

export async function upsertParking(spotId: number, data: { latitud: number; longitud: number; descripcion?: string }): Promise<ParkingSpot> {
  const res = await fetch(`${BASE}/spots/${spotId}/parking`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<ParkingSpot>;
}

export async function deleteParking(spotId: number): Promise<void> {
  const res = await fetch(`${BASE}/spots/${spotId}/parking`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 204) await handleError(res);
}
