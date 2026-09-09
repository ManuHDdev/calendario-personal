import { describe, it, expect } from 'vitest';
import { incrementUsageQuery, getUsageTodayQuery, todayUtc, nextUtcMidnight } from './usageCounter';

// No hay infraestructura de tests de integración contra Postgres real en
// este subapp (mismo criterio que ofertas/db/queries.test.ts) — se verifica
// el SQL generado a nivel de query builder puro.
describe('incrementUsageQuery', () => {
  it('upserts by (api_name, usage_date), incrementing on conflict', () => {
    const { text, values } = incrementUsageQuery('ors', '2026-09-09');
    expect(text).toContain('INSERT INTO api_usage_counter');
    expect(text).toContain('ON CONFLICT (api_name, usage_date)');
    expect(text).toContain('calls = api_usage_counter.calls + 1');
    expect(values).toEqual(['ors', '2026-09-09']);
  });
});

describe('getUsageTodayQuery', () => {
  it('selects calls for the given api and date', () => {
    const { text, values } = getUsageTodayQuery('tmdb', '2026-09-09');
    expect(text).toContain('FROM api_usage_counter');
    expect(text).toContain('WHERE api_name = $1 AND usage_date = $2');
    expect(values).toEqual(['tmdb', '2026-09-09']);
  });
});

describe('todayUtc', () => {
  it('returns a YYYY-MM-DD date string', () => {
    expect(todayUtc()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('nextUtcMidnight', () => {
  it('returns an ISO timestamp strictly after now', () => {
    const now = Date.now();
    const next = new Date(nextUtcMidnight()).getTime();
    expect(next).toBeGreaterThan(now);
  });

  it('lands exactly on a UTC midnight', () => {
    const next = new Date(nextUtcMidnight());
    expect(next.getUTCHours()).toBe(0);
    expect(next.getUTCMinutes()).toBe(0);
    expect(next.getUTCSeconds()).toBe(0);
  });
});
