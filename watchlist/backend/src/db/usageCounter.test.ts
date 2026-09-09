import { describe, it, expect } from 'vitest';
import { incrementUsageQuery, getUsageTodayQuery, todayUtc, nextUtcMidnight } from './usageCounter';

describe('incrementUsageQuery', () => {
  it('upserts by (api_name, usage_date), incrementing on conflict', () => {
    const { text, values } = incrementUsageQuery('tmdb', '2026-09-09');
    expect(text).toContain('INSERT INTO api_usage_counter');
    expect(text).toContain('ON CONFLICT (api_name, usage_date)');
    expect(text).toContain('calls = api_usage_counter.calls + 1');
    expect(values).toEqual(['tmdb', '2026-09-09']);
  });
});

describe('getUsageTodayQuery', () => {
  it('selects calls for the given api and date', () => {
    const { text, values } = getUsageTodayQuery('google_books', '2026-09-09');
    expect(text).toContain('FROM api_usage_counter');
    expect(text).toContain('WHERE api_name = $1 AND usage_date = $2');
    expect(values).toEqual(['google_books', '2026-09-09']);
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
});
