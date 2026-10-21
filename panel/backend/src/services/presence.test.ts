import { describe, it, expect } from 'vitest';
import { derivePresence, ONLINE_WINDOW_MS } from './presence';

const NOW = 1_800_000_000_000;

describe('derivePresence', () => {
  it('is offline with no sessions', () => {
    expect(derivePresence([], NOW)).toEqual({ status: 'offline', lastActivity: null });
  });

  it('is online when the latest access is within the window', () => {
    const last = NOW - 60_000;
    expect(derivePresence([{ lastAccess: last }], NOW)).toEqual({ status: 'online', lastActivity: last });
  });

  it('treats exactly the window boundary as online and one ms later as idle', () => {
    expect(derivePresence([{ lastAccess: NOW - ONLINE_WINDOW_MS }], NOW).status).toBe('online');
    expect(derivePresence([{ lastAccess: NOW - ONLINE_WINDOW_MS - 1 }], NOW).status).toBe('idle');
  });

  it('is idle (session open but quiet) and keeps the last activity', () => {
    const last = NOW - 3_600_000;
    expect(derivePresence([{ lastAccess: last }], NOW)).toEqual({ status: 'idle', lastActivity: last });
  });

  it('uses the most recent of several sessions (e.g. phone + laptop)', () => {
    const recent = NOW - 10_000;
    const result = derivePresence([{ lastAccess: NOW - 7_200_000 }, { lastAccess: recent }], NOW);
    expect(result).toEqual({ status: 'online', lastActivity: recent });
  });

  it('ignores sessions without a usable lastAccess instead of marking the user online', () => {
    expect(derivePresence([{}, { lastAccess: Number.NaN }], NOW)).toEqual({ status: 'offline', lastActivity: null });
  });

  it('does not count a future timestamp from clock skew as a negative age', () => {
    expect(derivePresence([{ lastAccess: NOW + 5_000 }], NOW).status).toBe('online');
  });
});
