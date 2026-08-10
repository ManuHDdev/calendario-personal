import keycloak from './keycloak';
import type {
  Item,
  CreateItemInput,
  UpdateItemInput,
  SearchResult,
  ItemListFilters,
} from '../types';

const BASE = '/watchlist/api';

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

export async function getItems(filters?: ItemListFilters): Promise<Item[]> {
  const params = new URLSearchParams();
  if (filters?.tipo) params.set('tipo', filters.tipo);
  if (filters?.estado) params.set('estado', filters.estado);
  const query = params.toString();
  const res = await fetch(`${BASE}/items${query ? `?${query}` : ''}`, {
    headers: authHeaders(),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Item[]>;
}

export async function createItem(data: CreateItemInput): Promise<Item> {
  const res = await fetch(`${BASE}/items`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Item>;
}

export async function updateItem(id: number, data: UpdateItemInput): Promise<Item> {
  const res = await fetch(`${BASE}/items/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Item>;
}

export async function deleteItem(id: number): Promise<void> {
  const res = await fetch(`${BASE}/items/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 204) await handleError(res);
}

async function search(kind: 'movies' | 'tv' | 'books', q: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q });
  const res = await fetch(`${BASE}/search/${kind}?${params}`, {
    headers: authHeaders(),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<SearchResult[]>;
}

export function searchMovies(q: string): Promise<SearchResult[]> {
  return search('movies', q);
}

export function searchTv(q: string): Promise<SearchResult[]> {
  return search('tv', q);
}

export function searchBooks(q: string): Promise<SearchResult[]> {
  return search('books', q);
}
