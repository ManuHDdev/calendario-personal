import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchMovies, MissingApiKeyError } from './tmdb';

describe('tmdb searchMovies', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('throws MissingApiKeyError when TMDB_API_KEY is unset', async () => {
    vi.stubEnv('TMDB_API_KEY', '');
    await expect(searchMovies('dune')).rejects.toBeInstanceOf(MissingApiKeyError);
  });

  it('maps a successful TMDB response to the internal DTO shape', async () => {
    vi.stubEnv('TMDB_API_KEY', 'fake-key');
    const fixture = {
      results: [
        {
          id: 438631,
          title: 'Dune',
          poster_path: '/poster.jpg',
          overview: 'Una historia en el desierto.',
        },
        {
          id: 999,
          title: 'Otra',
          poster_path: null,
          overview: null,
        },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fixture,
    }) as unknown as typeof fetch;

    const results = await searchMovies('dune');

    expect(results).toEqual([
      {
        external_id: '438631',
        titulo: 'Dune',
        poster_url: 'https://image.tmdb.org/t/p/w342/poster.jpg',
        sinopsis: 'Una historia en el desierto.',
      },
      {
        external_id: '999',
        titulo: 'Otra',
        poster_url: null,
        sinopsis: null,
      },
    ]);
  });
});
