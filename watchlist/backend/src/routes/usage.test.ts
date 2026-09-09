import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../db/pool', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../db/pool';
import { usageRoutes } from './usage';

const mockedQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

async function buildApp() {
  const app = Fastify();
  await app.register(usageRoutes);
  return app;
}

describe('GET /usage', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    process.env.PANEL_INTERNAL_TOKEN = 'test-internal-token';
  });

  it('rejects a missing Authorization header', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/usage' });
    expect(res.statusCode).toBe(401);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('rejects a wrong bearer token', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/usage',
      headers: { authorization: 'Bearer wrong-token' },
    });
    expect(res.statusCode).toBe(401);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('returns both tmdb (uncapped) and google_books (capped) entries for a valid token', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ calls: 12 }] }) // tmdb
      .mockResolvedValueOnce({ rows: [{ calls: 340 }] }); // google_books

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/usage',
      headers: { authorization: 'Bearer test-internal-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      {
        api: 'tmdb',
        label: 'TMDB',
        callsToday: 12,
        dailyLimit: null,
        remaining: null,
        resetsAt: expect.any(String),
      },
      {
        api: 'google_books',
        label: 'Google Books',
        callsToday: 340,
        dailyLimit: 1000,
        remaining: 660,
        resetsAt: expect.any(String),
      },
    ]);
  });
});
