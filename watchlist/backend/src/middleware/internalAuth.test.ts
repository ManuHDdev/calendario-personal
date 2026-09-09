import { describe, it, expect } from 'vitest';
import { isValidInternalToken } from './internalAuth';

describe('isValidInternalToken', () => {
  it('accepts the correct bearer token', () => {
    expect(isValidInternalToken('Bearer secret-token-123', 'secret-token-123')).toBe(true);
  });

  it('rejects a missing Authorization header', () => {
    expect(isValidInternalToken(undefined, 'secret-token-123')).toBe(false);
  });

  it('rejects a header without the Bearer prefix', () => {
    expect(isValidInternalToken('secret-token-123', 'secret-token-123')).toBe(false);
  });

  it('rejects a wrong token', () => {
    expect(isValidInternalToken('Bearer wrong-token', 'secret-token-123')).toBe(false);
  });

  it('rejects when PANEL_INTERNAL_TOKEN is not configured, even with a plausible token', () => {
    expect(isValidInternalToken('Bearer anything', undefined)).toBe(false);
    expect(isValidInternalToken('Bearer anything', '')).toBe(false);
  });

  it('rejects a valid-looking Keycloak JWT — the two auth mechanisms never overlap', () => {
    const fakeJwt =
      'eyJhbGciOiJSUzI1NiJ9.eyJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsiYWRtaW4iXX19.signature';
    expect(isValidInternalToken(`Bearer ${fakeJwt}`, 'secret-token-123')).toBe(false);
  });

  it('rejects an empty bearer value', () => {
    expect(isValidInternalToken('Bearer ', 'secret-token-123')).toBe(false);
  });
});
