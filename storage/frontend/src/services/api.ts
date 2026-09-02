import keycloak from './keycloak';
import type { AppUser, FileItem, FolderEntry, PermissionsResourceType } from '../types';

const BASE = '/storage/api';

function authHeaders(): Record<string, string> {
  const token = keycloak.token;
  if (!token) throw new Error('No auth token available');
  return { Authorization: `Bearer ${token}` };
}

export function encodePathParam(relativePath: string): string {
  // Codificar a UTF-8 antes de base64url para soportar caracteres no-ASCII
  const bytes = new TextEncoder().encode(relativePath);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Archivos de una carpeta, o de todo el disco si no se indica ninguna.
 * `rootOnly` pide solo los que no están en ninguna carpeta — es lo que
 * alimenta "Sin carpeta", que no es una carpeta real sino ese filtro.
 */
export async function getFiles(folder?: string, rootOnly = false): Promise<FileItem[]> {
  const url = new URL(BASE + '/files', window.location.origin);
  if (folder) url.searchParams.set('folder', folder);
  if (rootOnly) url.searchParams.set('rootOnly', 'true');
  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) throw new Error(`getFiles failed: ${res.status}`);
  return res.json() as Promise<FileItem[]>;
}

export async function getFolders(): Promise<FolderEntry[]> {
  const res = await fetch(`${BASE}/folders`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`getFolders failed: ${res.status}`);
  return res.json() as Promise<FolderEntry[]>;
}

export function uploadFile(
  file: File,
  folder?: string,
  onProgress?: (pct: number) => void,
): Promise<FileItem> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = new URL(BASE + '/upload', window.location.origin);
    if (folder) url.searchParams.set('folder', folder);

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
        resolve(JSON.parse(xhr.responseText) as FileItem);
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

/**
 * Subida troceada y reanudable.
 *
 * El problema que resuelve: con una única petición de 2 GB, que el móvil se
 * bloquee a mitad tira la conexión y la subida entera se pierde. Aquí el
 * archivo va en trozos, y si uno falla se reintenta ESE trozo — lo ya subido
 * se queda en el servidor.
 *
 * Quién manda sobre el punto de reanudación es el servidor: antes de cada
 * reintento se le pregunta por dónde va, en vez de fiarnos de nuestra cuenta,
 * que puede estar adelantada si se perdió la respuesta de un trozo.
 */

/** Trozos de 8 MB, el mismo tamaño que espera el backend. */
const CHUNK_BYTES = 8 * 1024 * 1024;

/** Reintentos por trozo antes de rendirse. Estar sin red no gasta intentos. */
const MAX_REINTENTOS = 8;

interface UploadProgressResponse {
  uploadId: string;
  receivedBytes: number;
  totalBytes: number;
}

function esperar(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(id); reject(new Error('Subida cancelada')); },
      { once: true });
  });
}

/**
 * Espera a recuperar la conexión. Mientras el navegador se sabe sin red no
 * tiene sentido quemar reintentos: se aguarda al evento `online`, que es justo
 * lo que dispara el móvil al desbloquearse. El tope evita quedarse colgado si
 * el evento no llega nunca.
 */
function esperarConexion(maxMs: number, signal?: AbortSignal): Promise<void> {
  if (navigator.onLine) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const fin = () => { limpiar(); resolve(); };
    const cancelar = () => { limpiar(); reject(new Error('Subida cancelada')); };
    const timer = setTimeout(fin, maxMs);
    function limpiar() {
      clearTimeout(timer);
      window.removeEventListener('online', fin);
      signal?.removeEventListener('abort', cancelar);
    }
    window.addEventListener('online', fin, { once: true });
    signal?.addEventListener('abort', cancelar, { once: true });
  });
}

async function crearSubida(file: File, folder?: string): Promise<UploadProgressResponse> {
  const res = await fetch(`${BASE}/uploads`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, mimeType: file.type, size: file.size, folder }),
  });
  if (!res.ok) throw new Error(await mensajeDeError(res, 'No se pudo iniciar la subida'));
  return res.json() as Promise<UploadProgressResponse>;
}

async function consultarSubida(uploadId: string): Promise<UploadProgressResponse> {
  const res = await fetch(`${BASE}/uploads/${uploadId}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await mensajeDeError(res, 'La subida ya no existe en el servidor'));
  return res.json() as Promise<UploadProgressResponse>;
}

async function mensajeDeError(res: Response, porDefecto: string): Promise<string> {
  try {
    const body = await res.json() as { error?: string };
    return body.error ?? `${porDefecto} (${res.status})`;
  } catch {
    return `${porDefecto} (${res.status})`;
  }
}

/**
 * Un error que no se arregla reintentando: tipo no admitido, sin permiso, la
 * sesión de subida ya no existe... Reintentarlo ocho veces solo retrasa el
 * mensaje que el usuario tiene que ver.
 */
class ErrorDefinitivo extends Error {}

// El 409 queda fuera a propósito: significa "ese trozo no encaja donde dices",
// y de eso se sale volviendo a preguntar al servidor por dónde iba, que es
// justo lo que hace el reintento.
function esDefinitivo(status: number): boolean {
  return status === 400 || status === 401 || status === 403 || status === 404
    || status === 413 || status === 415;
}

export interface UploadOptions {
  folder?: string;
  onProgress?: (pct: number) => void;
  /** Se avisa cuando una subida se queda esperando para reintentar. */
  onRetry?: (intento: number) => void;
  signal?: AbortSignal;
}

export async function uploadFileResumable(file: File, options: UploadOptions = {}): Promise<FileItem> {
  const { folder, onProgress, onRetry, signal } = options;

  // Para algo pequeño no compensa el ida y vuelta de abrir sesión: una sola
  // petición y listo. Un archivo así tampoco se pierde gran cosa si falla.
  if (file.size <= CHUNK_BYTES) {
    return uploadFile(file, folder, onProgress);
  }

  const { uploadId } = await crearSubida(file, folder);
  let enviados = 0;
  let intentos = 0;

  while (enviados < file.size) {
    if (signal?.aborted) throw new Error('Subida cancelada');

    const trozo = file.slice(enviados, Math.min(enviados + CHUNK_BYTES, file.size));
    try {
      const res = await fetch(`${BASE}/uploads/${uploadId}`, {
        method: 'PATCH',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/octet-stream',
          'X-Chunk-Offset': String(enviados),
        },
        body: trozo,
        signal,
      });

      if (!res.ok) {
        const mensaje = await mensajeDeError(res, 'Fallo subiendo un trozo');
        throw esDefinitivo(res.status) ? new ErrorDefinitivo(mensaje) : new Error(mensaje);
      }

      const estado = await res.json() as UploadProgressResponse;
      enviados = estado.receivedBytes;
      intentos = 0;
      onProgress?.(Math.round((enviados / file.size) * 100));
    } catch (err) {
      if (signal?.aborted) throw new Error('Subida cancelada');
      if (err instanceof ErrorDefinitivo) throw err;
      if (++intentos > MAX_REINTENTOS) throw err;

      onRetry?.(intentos);
      // Sin red no se gastan intentos: se espera a volver a tenerla.
      await esperarConexion(60_000, signal);
      await esperar(Math.min(1000 * 2 ** (intentos - 1), 15_000), signal);

      // El servidor decide desde dónde seguir. Si el trozo llegó y lo que se
      // perdió fue la respuesta, aquí se descubre y no se reenvía.
      enviados = (await consultarSubida(uploadId)).receivedBytes;
      onProgress?.(Math.round((enviados / file.size) * 100));
    }
  }

  const res = await fetch(`${BASE}/uploads/${uploadId}/complete`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await mensajeDeError(res, 'No se pudo cerrar la subida'));
  return res.json() as Promise<FileItem>;
}

/** Cancela una subida a medias y libera su espacio en el servidor. */
export async function cancelUpload(uploadId: string): Promise<void> {
  await fetch(`${BASE}/uploads/${uploadId}`, { method: 'DELETE', headers: authHeaders() });
}

export async function downloadFile(relativePath: string, filename: string): Promise<void> {
  const encoded = encodePathParam(relativePath);
  const res = await fetch(`${BASE}/files/${encoded}/download`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

export async function moveFile(relativePath: string, targetFolder?: string): Promise<FileItem> {
  const encoded = encodePathParam(relativePath);
  const res = await fetch(`${BASE}/files/${encoded}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder: targetFolder ?? null }),
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? `Move failed: ${res.status}`);
  }
  return res.json() as Promise<FileItem>;
}

export async function deleteFile(relativePath: string): Promise<void> {
  const encoded = encodePathParam(relativePath);
  const res = await fetch(`${BASE}/files/${encoded}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 204) throw new Error(`Delete failed: ${res.status}`);
}

export async function createFolder(name: string): Promise<void> {
  const res = await fetch(`${BASE}/folders`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? `Create folder failed: ${res.status}`);
  }
}

export async function renameFolder(folderPath: string, newName: string): Promise<string> {
  const encoded = encodePathParam(folderPath);
  const res = await fetch(`${BASE}/folders/${encoded}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ newName }),
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? `Rename failed: ${res.status}`);
  }
  const data = (await res.json()) as { path: string };
  return data.path;
}

export async function deleteFolder(folderPath: string): Promise<void> {
  const encoded = encodePathParam(folderPath);
  const res = await fetch(`${BASE}/folders/${encoded}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 204) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? `Delete folder failed: ${res.status}`);
  }
}

export async function listUsers(): Promise<AppUser[]> {
  const res = await fetch(`${BASE}/users`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`listUsers failed: ${res.status}`);
  return res.json() as Promise<AppUser[]>;
}

function permissionsUrl(type: PermissionsResourceType, relativePath: string): string {
  const encoded = encodePathParam(relativePath);
  const segment = type === 'file' ? 'files' : 'folders';
  return `${BASE}/${segment}/${encoded}/permissions`;
}

export async function getPermissions(
  type: PermissionsResourceType,
  relativePath: string,
): Promise<string[]> {
  const res = await fetch(permissionsUrl(type, relativePath), { headers: authHeaders() });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? `getPermissions failed: ${res.status}`);
  }
  const data = (await res.json()) as { userIds: string[] };
  return data.userIds;
}

export async function setPermissions(
  type: PermissionsResourceType,
  relativePath: string,
  userIds: string[],
): Promise<string[]> {
  const res = await fetch(permissionsUrl(type, relativePath), {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds }),
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? `setPermissions failed: ${res.status}`);
  }
  const data = (await res.json()) as { userIds: string[] };
  return data.userIds;
}

export function previewUrl(relativePath: string): string {
  const encoded = encodePathParam(relativePath);
  const token = keycloak.token ?? '';
  return `${BASE}/files/${encoded}/preview?token=${encodeURIComponent(token)}`;
}

export function thumbnailUrl(relativePath: string): string {
  const encoded = encodePathParam(relativePath);
  const token = keycloak.token ?? '';
  return `${BASE}/files/${encoded}/thumbnail?token=${encodeURIComponent(token)}`;
}
