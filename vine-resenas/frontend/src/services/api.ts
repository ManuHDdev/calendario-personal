import keycloak from './keycloak';
import type { Counts, CreatedGuestLink, GuestLinkInfo, Product, ProductSummary, UploadResult } from '../types';

const BASE = '/vine-resenas/api/ui';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function freshToken(): Promise<string> {
  try {
    await keycloak.updateToken(30);
  } catch {
    /* use the current token; the request will 401 if it is really expired */
  }
  if (!keycloak.token) throw new ApiError(401, 'Sesión no válida');
  return keycloak.token;
}

async function toError(res: Response): Promise<ApiError> {
  let msg = `Error ${res.status}`;
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    msg = body.message || body.error || msg;
  } catch {
    /* keep default */
  }
  return new ApiError(res.status, msg);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await freshToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  // Only declare JSON when there is a body: Fastify rejects an empty JSON body.
  if (init.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Media URLs go in <img>/<video>, which cannot send headers, so the backend accepts ?token=. */
export function withToken(url: string | null): string {
  if (!url) return '';
  const token = keycloak.token ?? '';
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

export const getProducts = (query: string) => request<ProductSummary[]>(`/products${query}`);
export const getCounts = () => request<Counts>('/counts');
export const getProduct = (asin: string) => request<Product>(`/products/${encodeURIComponent(asin)}`);

export const saveContent = (asin: string, patch: { feedback?: string; estrellas?: number | null }) =>
  request<unknown>(`/products/${encodeURIComponent(asin)}`, { method: 'PUT', body: JSON.stringify(patch) });

export const markListo = (asin: string) =>
  request<unknown>(`/products/${encodeURIComponent(asin)}/listo`, { method: 'POST' });

export const markEspera = (asin: string) =>
  request<unknown>(`/products/${encodeURIComponent(asin)}/espera`, { method: 'POST' });

export const markReanudar = (asin: string) =>
  request<unknown>(`/products/${encodeURIComponent(asin)}/reanudar`, { method: 'POST' });

export const markPublicado = (asin: string) =>
  request<unknown>(`/products/${encodeURIComponent(asin)}/publicado`, { method: 'POST' });

export const deleteMedia = (asin: string, filename: string) =>
  request<void>(`/products/${encodeURIComponent(asin)}/media/${encodeURIComponent(filename)}`, { method: 'DELETE' });

/** Uploads one file with progress (fetch cannot report upload progress). */
export async function uploadMedia(
  asin: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<UploadResult> {
  const token = await freshToken();
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/products/${encodeURIComponent(asin)}/media`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new ApiError(0, 'Error de red al subir el archivo'));
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as UploadResult);
        return;
      }
      const b = body as { message?: string; rejected?: { message: string }[] } | null;
      reject(new ApiError(xhr.status, b?.rejected?.[0]?.message || b?.message || `Error ${xhr.status}`));
    };
    const form = new FormData();
    form.append('files', file, file.name);
    xhr.send(form);
  });
}

export const createGuestLink = (asin: string, expiresInDays?: number) =>
  request<CreatedGuestLink>(`/products/${encodeURIComponent(asin)}/guest-links`, {
    method: 'POST',
    body: JSON.stringify(expiresInDays ? { expiresInDays } : {}),
  });

export const listGuestLinks = (asin: string) =>
  request<GuestLinkInfo[]>(`/products/${encodeURIComponent(asin)}/guest-links`);

export const revokeGuestLink = (id: number) => request<void>(`/guest-links/${id}`, { method: 'DELETE' });
