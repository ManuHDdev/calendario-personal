import keycloak from './keycloak';
import type { Camara, CamaraInput, CamaraPatch, Ciudad, EstadoImportacion } from '../types';

const BASE = '/camaras/api';

export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

function authHeaders(): Record<string, string> {
  const token = keycloak.token;
  if (!token) throw new ApiError('No auth token', 401);
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function handleError(res: Response): Promise<never> {
  let message = `Error ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch {
    /* ignore */
  }
  throw new ApiError(message, res.status);
}

/** Renueva el token si le quedan menos de `minValiditySeconds`; si no se puede, vuelve al login. */
export async function refreshToken(minValiditySeconds = 60): Promise<void> {
  try {
    await keycloak.updateToken(minValiditySeconds);
  } catch {
    keycloak.login();
  }
}

async function get<T>(path: string): Promise<T> {
  await refreshToken(30);
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<T>;
}

export const getCiudades = (): Promise<Ciudad[]> => get('/ciudades');
export const getCamaras = (): Promise<Camara[]> => get('/camaras');
export const getEstado = (): Promise<EstadoImportacion> => get('/estado');

export async function createCamara(data: CamaraInput): Promise<Camara> {
  await refreshToken(30);
  const res = await fetch(`${BASE}/camaras`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Camara>;
}

export async function updateCamara(id: number, data: CamaraPatch): Promise<Camara> {
  await refreshToken(30);
  const res = await fetch(`${BASE}/camaras/${id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data) });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Camara>;
}

export async function deleteCamara(id: number): Promise<void> {
  await refreshToken(30);
  const res = await fetch(`${BASE}/camaras/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok && res.status !== 204) await handleError(res);
}

export async function lanzarImportacion(): Promise<void> {
  await refreshToken(30);
  const res = await fetch(`${BASE}/importacion`, { method: 'POST', headers: authHeaders() });
  if (!res.ok) await handleError(res);
}

/**
 * URL de la imagen de una cámara. <img> no puede mandar Authorization, así que
 * lleva el access token en `?token=` (mismo patrón que storage/descargas); el
 * nginx no la registra. `t` rompe la caché del navegador en cada refresco.
 */
export function imagenUrl(id: number, t: number = Date.now()): string {
  return `${BASE}/camaras/${id}/imagen?token=${encodeURIComponent(keycloak.token ?? '')}&t=${t}`;
}
