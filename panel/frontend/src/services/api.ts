import keycloak from './keycloak';
import type { UserOut, UserFormData } from '../types';

const BASE = '/panel/api';

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

export async function getUsers(): Promise<UserOut[]> {
  const res = await fetch(`${BASE}/users`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<UserOut[]>;
}

export async function getRoles(): Promise<string[]> {
  const res = await fetch(`${BASE}/roles`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<string[]>;
}

export async function createUser(data: UserFormData): Promise<UserOut> {
  const res = await fetch(`${BASE}/users`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<UserOut>;
}

export async function updateUser(
  id: string,
  data: Partial<UserFormData>,
): Promise<UserOut> {
  const res = await fetch(`${BASE}/users/${id}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<UserOut>;
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`${BASE}/users/${id}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok && res.status !== 204) await handleError(res);
}
