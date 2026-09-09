import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// No hay infraestructura de tests de integración contra Postgres real en
// este subapp — se mockea el pool (mismo criterio que ofertas/routes/scraperState.test.ts).
vi.mock('../db/pool', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../db/pool';
import { routeDistanceRoutes } from './route';

const mockedQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

async function buildApp() {
  const app = Fastify();
  await app.register(routeDistanceRoutes);
  return app;
}

const orsFixture = {
  features: [{ properties: { summary: { distance: 12345, duration: 900 } } }],
};

let coordCounter = 0;

/** Distinct coordinates per call so the 6h result cache never short-circuits the test. */
function coordsQuery() {
  coordCounter += 1;
  const lat = (40 + coordCounter).toFixed(3);
  return `fromLat=${lat}&fromLng=-3.700&toLat=41.400&toLng=2.200`;
}

describe('GET /route-distance — persistent daily ORS counter', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    process.env.ORS_API_KEY = 'test-ors-key';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => orsFixture,
    }) as unknown as typeof fetch;
  });

  it('under the cap: reads usage from Postgres, calls ORS, and increments the counter', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ calls: 5 }] }) // getUsageToday
      .mockResolvedValueOnce({ rows: [] }); // incrementUsage

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/route-distance?${coordsQuery()}` });

    expect(res.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockedQuery).toHaveBeenCalledTimes(2);
    const incrementCall = mockedQuery.mock.calls[1];
    expect(incrementCall[0]).toContain('INSERT INTO api_usage_counter');
  });

  it('at the cap: responds 503 without calling ORS or incrementing', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ calls: 2000 }] }); // getUsageToday

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/route-distance?${coordsQuery()}` });

    expect(res.statusCode).toBe(503);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockedQuery).toHaveBeenCalledTimes(1); // only the read, no increment
  });

  it('counter is read fresh from Postgres on every call — no module-level state to reset', async () => {
    // Simulates two calls as if the process restarted in between: the second
    // call sees whatever Postgres reports, not a counter reset to 0.
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ calls: 1999 }] }) // first call: getUsageToday
      .mockResolvedValueOnce({ rows: [] }) // first call: incrementUsage
      .mockResolvedValueOnce({ rows: [{ calls: 2000 }] }); // second call: getUsageToday (now at cap)

    const app = await buildApp();
    const first = await app.inject({ method: 'GET', url: `/route-distance?${coordsQuery()}` });
    const second = await app.inject({ method: 'GET', url: `/route-distance?${coordsQuery()}` });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(503);
  });

  it('a cache hit does not touch the database at all', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ calls: 5 }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = await buildApp();
    const url = `/route-distance?fromLat=40.400&fromLng=-3.700&toLat=41.400&toLng=2.200`;

    const first = await app.inject({ method: 'GET', url });
    expect(first.statusCode).toBe(200);
    mockedQuery.mockClear();
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();

    const second = await app.inject({ method: 'GET', url });
    expect(second.statusCode).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});
