import keycloak from './keycloak';
import type { FileItem } from '../types';

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

export async function getFiles(folder?: string): Promise<FileItem[]> {
  const url = new URL(BASE + '/files', window.location.origin);
  if (folder) url.searchParams.set('folder', folder);
  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) throw new Error(`getFiles failed: ${res.status}`);
  return res.json() as Promise<FileItem[]>;
}

export async function getFolders(): Promise<string[]> {
  const res = await fetch(`${BASE}/folders`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`getFolders failed: ${res.status}`);
  return res.json() as Promise<string[]>;
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
