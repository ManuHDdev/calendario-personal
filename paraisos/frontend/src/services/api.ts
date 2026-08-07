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

export async function getRoadDistance(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<{ distanceKm: number; durationMin: number }> {
  const params = new URLSearchParams({
    fromLat: String(from.lat),
    fromLng: String(from.lng),
    toLat: String(to.lat),
    toLng: String(to.lng),
  });
  const res = await fetch(`${BASE}/route-distance?${params}`);
  if (!res.ok) await handleError(res);
  return res.json() as Promise<{ distanceKm: number; durationMin: number }>;
}

export function uploadSpotImage(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = new URL(BASE + '/images', window.location.origin);

    xhr.open('POST', url.toString());

    const token = keycloak.token;
    if (!token) { reject(new Error('No auth token available')); return; }
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as { url: string });
      } else {
        try {
          const body = JSON.parse(xhr.responseText) as { error?: string };
          reject(new Error(body.error ?? `Upload failed: ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));

    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
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
