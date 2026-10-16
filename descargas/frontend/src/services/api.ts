import keycloak from './keycloak';
import type { DirEntry } from '../lib/files';

const BASE = '/descargas/api';

export interface Listing {
  path: string;
  entries: DirEntry[];
}

/** Query string for a root-relative path (`path` is URL-encoded once). */
export function pathQuery(path: string): string {
  return `path=${encodeURIComponent(path)}`;
}

export async function listDir(path: string, signal?: AbortSignal): Promise<Listing> {
  const token = keycloak.token;
  if (!token) throw new Error('Sesión no válida');
  const res = await fetch(`${BASE}/list?${pathQuery(path)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) {
    let msg = res.status === 404 ? 'No se ha encontrado la carpeta' : `Error ${res.status}`;
    if (res.status === 403) msg = 'No tienes permiso para ver estos archivos';
    throw new Error(msg);
  }
  return (await res.json()) as Listing;
}

// <img>/<video>/<a> cannot send an Authorization header, so media URLs carry the
// Keycloak access token as `?token=` (same pattern as storage). Build them at
// the moment they are needed so the token is as fresh as possible.
function mediaUrl(route: 'file' | 'download', path: string): string {
  return `${BASE}/${route}?${pathQuery(path)}&token=${encodeURIComponent(keycloak.token ?? '')}`;
}

export const fileUrl = (path: string): string => mediaUrl('file', path);
export const downloadUrl = (path: string): string => mediaUrl('download', path);

/** Keeps the access token valid for media URLs built later. */
export async function refreshToken(minValiditySeconds = 60): Promise<void> {
  try {
    await keycloak.updateToken(minValiditySeconds);
  } catch {
    keycloak.login();
  }
}
