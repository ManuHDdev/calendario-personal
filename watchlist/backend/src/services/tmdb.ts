import { incrementUsage } from '../db/usageCounter';

export class MissingApiKeyError extends Error {
  constructor() {
    super('TMDB_API_KEY no configurada');
    this.name = 'MissingApiKeyError';
  }
}

export interface TmdbSearchResult {
  external_id: string;
  titulo: string;
  poster_url: string | null;
  sinopsis: string | null;
}

interface TmdbApiResult {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  overview?: string | null;
}

interface TmdbApiResponse {
  results?: TmdbApiResult[];
}

// Caché en memoria por `${mediaType}:${q normalizada}`, TTL ~10min — más
// ligera que la de paraisos (route.ts), sin rate-limit por IP ni tope diario,
// ya que TMDB tiene una cuota gratuita generosa.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { data: TmdbSearchResult[]; expiresAt: number }>();

function mapResult(r: TmdbApiResult): TmdbSearchResult {
  return {
    external_id: String(r.id),
    titulo: r.title ?? r.name ?? '',
    poster_url: r.poster_path ? `https://image.tmdb.org/t/p/w342${r.poster_path}` : null,
    sinopsis: r.overview ?? null,
  };
}

async function search(mediaType: 'movie' | 'tv', q: string): Promise<TmdbSearchResult[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  const normalized = q.trim().toLowerCase();
  const cacheKey = `${mediaType}:${normalized}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const url = `https://api.themoviedb.org/3/search/${mediaType}?query=${encodeURIComponent(q)}&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  await incrementUsage('tmdb'); // cuenta la llamada real, nunca un cache hit (return anterior)
  if (!res.ok) {
    throw new Error(`TMDB respondió ${res.status}`);
  }

  const body = (await res.json()) as TmdbApiResponse;
  const data = (body.results ?? []).slice(0, 10).map(mapResult);
  cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

export function searchMovies(q: string): Promise<TmdbSearchResult[]> {
  return search('movie', q);
}

export function searchTv(q: string): Promise<TmdbSearchResult[]> {
  return search('tv', q);
}
