import { describe, it, expect, beforeEach, vi } from 'vitest';

// No hay infraestructura de tests de integración contra Postgres real en
// este subapp — se mockea el pool que usa incrementUsage() (mismo criterio
// que ofertas/routes/scraperState.test.ts).
vi.mock('../db/pool', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../db/pool';
import { searchMovies, MissingApiKeyError } from './tmdb';

const mockedQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

describe('tmdb searchMovies', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    mockedQuery.mockReset();
    mockedQuery.mockResolvedValue({ rows: [] });
  });

  it('throws MissingApiKeyError when TMDB_API_KEY is unset', async () => {
    vi.stubEnv('TMDB_API_KEY', '');
    await expect(searchMovies('dune')).rejects.toBeInstanceOf(MissingApiKeyError);
    expect(mockedQuery).not.toHaveBeenCalled();
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

  it('increments the tmdb usage counter on a real call', async () => {
    vi.stubEnv('TMDB_API_KEY', 'fake-key');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    }) as unknown as typeof fetch;

    await searchMovies('unique-query-1');

    expect(mockedQuery).toHaveBeenCalledTimes(1);
    expect(mockedQuery.mock.calls[0][0]).toContain('INSERT INTO api_usage_counter');
    expect(mockedQuery.mock.calls[0][1]).toEqual(['tmdb', expect.any(String)]);
  });

  it('does not increment the usage counter on a cache hit', async () => {
    vi.stubEnv('TMDB_API_KEY', 'fake-key');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    }) as unknown as typeof fetch;

    await searchMovies('unique-query-2');
    mockedQuery.mockClear();
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();

    await searchMovies('unique-query-2'); // same query, served from the 10min in-memory cache

    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});
