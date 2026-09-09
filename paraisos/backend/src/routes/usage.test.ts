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

  it('returns the ors usage entry with the correct shape for a valid token', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ calls: 143 }] });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/usage',
      headers: { authorization: 'Bearer test-internal-token' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual([
      {
        api: 'ors',
        label: 'OpenRouteService',
        callsToday: 143,
        dailyLimit: 2000,
        remaining: 1857,
        resetsAt: expect.any(String),
      },
    ]);
  });

  it('clamps remaining at 0 if calls ever exceed the cap', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ calls: 2005 }] });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/usage',
      headers: { authorization: 'Bearer test-internal-token' },
    });

    expect(res.json()[0].remaining).toBe(0);
  });
});
