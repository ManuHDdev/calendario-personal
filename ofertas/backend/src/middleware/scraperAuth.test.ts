import { describe, it, expect } from 'vitest';
import { isValidScraperToken } from './scraperAuth';

describe('isValidScraperToken', () => {
  it('accepts the correct bearer token', () => {
    expect(isValidScraperToken('Bearer secret-token-123', 'secret-token-123')).toBe(true);
  });

  it('rejects a missing Authorization header', () => {
    expect(isValidScraperToken(undefined, 'secret-token-123')).toBe(false);
  });

  it('rejects a header without the Bearer prefix', () => {
    expect(isValidScraperToken('secret-token-123', 'secret-token-123')).toBe(false);
  });

  it('rejects a wrong token', () => {
    expect(isValidScraperToken('Bearer wrong-token', 'secret-token-123')).toBe(false);
  });

  it('rejects when SCRAPER_API_KEY is not configured, even with a plausible token', () => {
    expect(isValidScraperToken('Bearer anything', undefined)).toBe(false);
    expect(isValidScraperToken('Bearer anything', '')).toBe(false);
  });

  it('rejects a valid-looking Keycloak JWT — the two auth mechanisms never overlap', () => {
    const fakeJwt =
      'eyJhbGciOiJSUzI1NiJ9.eyJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsiYWRtaW4iXX19.signature';
    expect(isValidScraperToken(`Bearer ${fakeJwt}`, 'secret-token-123')).toBe(false);
  });

  it('rejects an empty bearer value', () => {
    expect(isValidScraperToken('Bearer ', 'secret-token-123')).toBe(false);
  });
});
