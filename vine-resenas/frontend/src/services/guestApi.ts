// Public API for the guest page. It must NEVER import keycloak: the guest has no account and the page
// must not trigger a login. The secret is the token in the path.
import type { GuestView } from '../types';

const BASE = '/vine-resenas/api/guest';

export class GuestApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Pulls the token out of /vine-resenas/c/<token>. */
export function tokenFromPath(pathname: string): string | null {
  const m = /^\/vine-resenas\/c\/([A-Za-z0-9_-]+)\/?$/.exec(pathname);
  return m ? m[1] : null;
}

export const isGuestPath = (pathname: string) => pathname.startsWith('/vine-resenas/c/');

async function toError(res: Response): Promise<GuestApiError> {
  let msg = `Error ${res.status}`;
  try {
    const b = (await res.json()) as { message?: string };
    if (b.message) msg = b.message;
  } catch {
    /* keep default */
  }
  return new GuestApiError(res.status, msg);
}

export async function getGuestView(token: string): Promise<GuestView> {
  const res = await fetch(`${BASE}/${token}`);
  if (!res.ok) throw await toError(res);
  return res.json() as Promise<GuestView>;
}

export async function saveGuestFeedback(token: string, feedback: string): Promise<void> {
  const res = await fetch(`${BASE}/${token}/feedback`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedback }),
  });
  if (!res.ok) throw await toError(res);
}

export async function deleteGuestMedia(token: string, filename: string): Promise<void> {
  const res = await fetch(`${BASE}/${token}/media/${encodeURIComponent(filename)}`, { method: 'DELETE' });
  if (!res.ok) throw await toError(res);
}

/** Uploads one file with progress (fetch cannot report upload progress). */
export function uploadGuestMedia(token: string, file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/${token}/media`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new GuestApiError(0, 'Error de red al subir el archivo'));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let body: { message?: string; rejected?: { error?: string; message: string }[] } | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error */
      }
      const rej = body?.rejected?.[0];
      reject(new GuestApiError(xhr.status, rej?.message || body?.message || `Error ${xhr.status}`));
    };
    const form = new FormData();
    form.append('files', file, file.name);
    xhr.send(form);
  });
}
