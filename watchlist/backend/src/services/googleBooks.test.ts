import { describe, it, expect, beforeEach, vi } from 'vitest';

// No hay infraestructura de tests de integración contra Postgres real en
// este subapp — se mockea el pool que usa incrementUsage().
vi.mock('../db/pool', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../db/pool';
import { searchBooks, MissingApiKeyError } from './googleBooks';

const mockedQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

describe('googleBooks searchBooks', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    mockedQuery.mockReset();
    mockedQuery.mockResolvedValue({ rows: [] });
  });

  it('throws MissingApiKeyError when GOOGLE_BOOKS_API_KEY is unset', async () => {
    vi.stubEnv('GOOGLE_BOOKS_API_KEY', '');
    await expect(searchBooks('dune')).rejects.toBeInstanceOf(MissingApiKeyError);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('maps a successful Google Books response to the internal DTO shape', async () => {
    vi.stubEnv('GOOGLE_BOOKS_API_KEY', 'fake-key');
    const fixture = {
      items: [
        {
          id: 'abc123',
          volumeInfo: {
            title: 'Dune',
            authors: ['Frank Herbert'],
            description: 'Una novela de ciencia ficción.',
            imageLinks: { thumbnail: 'https://books.google.com/thumb.jpg' },
          },
        },
        {
          id: 'def456',
          volumeInfo: {
            title: 'Sin autor',
          },
        },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fixture,
    }) as unknown as typeof fetch;

    const results = await searchBooks('dune');

    expect(results).toEqual([
      {
        external_id: 'abc123',
        titulo: 'Dune',
        autor: 'Frank Herbert',
        poster_url: 'https://books.google.com/thumb.jpg',
        sinopsis: 'Una novela de ciencia ficción.',
      },
      {
        external_id: 'def456',
        titulo: 'Sin autor',
        autor: null,
        poster_url: null,
        sinopsis: null,
      },
    ]);
  });

  it('increments the google_books usage counter on a real call', async () => {
    vi.stubEnv('GOOGLE_BOOKS_API_KEY', 'fake-key');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    }) as unknown as typeof fetch;

    await searchBooks('unique-query-1');

    expect(mockedQuery).toHaveBeenCalledTimes(1);
    expect(mockedQuery.mock.calls[0][0]).toContain('INSERT INTO api_usage_counter');
    expect(mockedQuery.mock.calls[0][1]).toEqual(['google_books', expect.any(String)]);
  });

  it('does not increment the usage counter on a cache hit', async () => {
    vi.stubEnv('GOOGLE_BOOKS_API_KEY', 'fake-key');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    }) as unknown as typeof fetch;

    await searchBooks('unique-query-2');
    mockedQuery.mockClear();
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();

    await searchBooks('unique-query-2'); // same query, served from the 10min in-memory cache

    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});
