import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAllUsage } from './subappUsage';

describe('getAllUsage', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.stubEnv('PANEL_INTERNAL_TOKEN', 'test-internal-token');
    vi.stubEnv('PARAISOS_BACKEND_URL', 'http://paraisos-backend:3007');
    vi.stubEnv('WATCHLIST_BACKEND_URL', 'http://watchlist-backend:3009');
  });

  it('flattens both subapps in the fixed order ors, tmdb, google_books', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('paraisos')) {
        return {
          ok: true,
          json: async () => [
            { api: 'ors', label: 'OpenRouteService', callsToday: 100, dailyLimit: 2000, remaining: 1900, resetsAt: '2026-09-10T00:00:00.000Z' },
          ],
        };
      }
      return {
        ok: true,
        json: async () => [
          { api: 'tmdb', label: 'TMDB', callsToday: 5, dailyLimit: null, remaining: null, resetsAt: '2026-09-10T00:00:00.000Z' },
          { api: 'google_books', label: 'Google Books', callsToday: 10, dailyLimit: 1000, remaining: 990, resetsAt: '2026-09-10T00:00:00.000Z' },
        ],
      };
    }) as unknown as typeof fetch;

    const result = await getAllUsage();

    expect(result.map((e) => e.api)).toEqual(['ors', 'tmdb', 'google_books']);
    expect(result.every((e) => e.unavailable === false)).toBe(true);
    expect(result[0]).toMatchObject({ callsToday: 100, dailyLimit: 2000, remaining: 1900 });
  });

  it('sends the internal bearer token to both subapps', async () => {
    const fetchMock = vi.fn(async (_url: string, _options?: RequestInit) => ({
      ok: true,
      json: async () => [],
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await getAllUsage();

    for (const call of fetchMock.mock.calls) {
      const options = call[1];
      expect((options?.headers as Record<string, string>).Authorization).toBe(
        'Bearer test-internal-token',
      );
    }
  });

  it('degrades only the failing subapp to unavailable, keeps the other populated', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('paraisos')) {
        throw new Error('network error');
      }
      return {
        ok: true,
        json: async () => [
          { api: 'tmdb', label: 'TMDB', callsToday: 5, dailyLimit: null, remaining: null, resetsAt: '2026-09-10T00:00:00.000Z' },
          { api: 'google_books', label: 'Google Books', callsToday: 10, dailyLimit: 1000, remaining: 990, resetsAt: '2026-09-10T00:00:00.000Z' },
        ],
      };
    }) as unknown as typeof fetch;

    const result = await getAllUsage();

    const ors = result.find((e) => e.api === 'ors')!;
    expect(ors.unavailable).toBe(true);
    expect(ors.callsToday).toBeNull();
    expect(ors.remaining).toBeNull();

    const tmdb = result.find((e) => e.api === 'tmdb')!;
    expect(tmdb.unavailable).toBe(false);
    expect(tmdb.callsToday).toBe(5);
  });

  it('degrades to unavailable on a non-2xx response, not just a network error', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => [] })) as unknown as typeof fetch;

    const result = await getAllUsage();

    expect(result.every((e) => e.unavailable === true)).toBe(true);
  });

  it('degrades to unavailable on a malformed (non-array) body', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ not: 'an array' }) })) as unknown as typeof fetch;

    const result = await getAllUsage();

    expect(result.every((e) => e.unavailable === true)).toBe(true);
  });

  it('still returns a known entry as unavailable when the subapp omits it from its response', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => [] })) as unknown as typeof fetch;

    const result = await getAllUsage();

    expect(result).toHaveLength(3);
    expect(result.every((e) => e.unavailable === true)).toBe(true);
  });
});
