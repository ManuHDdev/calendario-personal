import { incrementUsage } from '../db/usageCounter';

export class MissingApiKeyError extends Error {
  constructor() {
    super('GOOGLE_BOOKS_API_KEY no configurada');
    this.name = 'MissingApiKeyError';
  }
}

export interface GoogleBooksSearchResult {
  external_id: string;
  titulo: string;
  autor: string | null;
  poster_url: string | null;
  sinopsis: string | null;
}

interface GoogleBooksVolumeInfo {
  title?: string;
  authors?: string[];
  description?: string;
  imageLinks?: { thumbnail?: string };
}

interface GoogleBooksApiItem {
  id: string;
  volumeInfo?: GoogleBooksVolumeInfo;
}

interface GoogleBooksApiResponse {
  items?: GoogleBooksApiItem[];
}

// Caché en memoria por `q` normalizada, TTL ~10min — mismo patrón que
// services/tmdb.ts.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { data: GoogleBooksSearchResult[]; expiresAt: number }>();

function mapResult(item: GoogleBooksApiItem): GoogleBooksSearchResult {
  const info = item.volumeInfo ?? {};
  return {
    external_id: item.id,
    titulo: info.title ?? '',
    autor: info.authors && info.authors.length > 0 ? info.authors.join(', ') : null,
    poster_url: info.imageLinks?.thumbnail ?? null,
    sinopsis: info.description ?? null,
  };
}

// Nota: la API de Google Books técnicamente funciona sin key (con cuota
// menor), pero por consistencia con el resto de endpoints de búsqueda (todos
// devuelven 503 si falta la key), aquí también se exige — comportamiento
// más simple y uniforme aunque implique no aprovechar el acceso sin key.
export async function searchBooks(q: string): Promise<GoogleBooksSearchResult[]> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  const normalized = q.trim().toLowerCase();
  const cached = cache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&key=${encodeURIComponent(apiKey)}&maxResults=10`;
  const res = await fetch(url);
  await incrementUsage('google_books'); // cuenta la llamada real, nunca un cache hit (return anterior)
  if (!res.ok) {
    throw new Error(`Google Books respondió ${res.status}`);
  }

  const body = (await res.json()) as GoogleBooksApiResponse;
  const data = (body.items ?? []).slice(0, 10).map(mapResult);
  cache.set(normalized, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}
