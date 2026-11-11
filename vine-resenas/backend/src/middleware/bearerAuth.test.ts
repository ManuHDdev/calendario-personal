import { describe, it, expect } from 'vitest';
import { isValidApiToken, apiTokenMiddleware } from './bearerAuth';

describe('isValidApiToken', () => {
  it('accepts the correct bearer token', () => {
    expect(isValidApiToken('Bearer secret-token-123', 'secret-token-123')).toBe(true);
  });
  it('rejects a missing header', () => {
    expect(isValidApiToken(undefined, 'secret-token-123')).toBe(false);
  });
  it('rejects a header without the Bearer prefix', () => {
    expect(isValidApiToken('secret-token-123', 'secret-token-123')).toBe(false);
  });
  it('rejects a wrong token, including different lengths (no throw)', () => {
    expect(isValidApiToken('Bearer wrong', 'secret-token-123')).toBe(false);
    expect(isValidApiToken('Bearer secret-token-1234567', 'secret-token-123')).toBe(false);
  });
  it('rejects everything when the key is unset or empty', () => {
    expect(isValidApiToken('Bearer anything', undefined)).toBe(false);
    expect(isValidApiToken('Bearer anything', '')).toBe(false);
    expect(isValidApiToken('Bearer ', '')).toBe(false);
  });
  it('rejects an empty bearer value', () => {
    expect(isValidApiToken('Bearer ', 'secret-token-123')).toBe(false);
  });
  it('rejects a Keycloak-looking JWT', () => {
    const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJyZWFsbV9hY2Nlc3MiOnt9fQ.sig';
    expect(isValidApiToken(`Bearer ${jwt}`, 'secret-token-123')).toBe(false);
  });
});

describe('apiTokenMiddleware', () => {
  function fakeReply() {
    const r = {
      status: 0,
      body: undefined as unknown,
      code(n: number) {
        r.status = n;
        return r;
      },
      send(b: unknown) {
        r.body = b;
        return r;
      },
    };
    return r;
  }
  it('answers 401 with an {error,message} body and never echoes the token', async () => {
    const reply = fakeReply();
    await apiTokenMiddleware(() => 'right')({ headers: { authorization: 'Bearer wrong-secret' } } as never, reply as never);
    expect(reply.status).toBe(401);
    expect(JSON.stringify(reply.body)).not.toContain('wrong-secret');
    expect(reply.body).toMatchObject({ error: 'Unauthorized' });
  });
  it('lets a valid token through without replying', async () => {
    const reply = fakeReply();
    await apiTokenMiddleware(() => 'right')({ headers: { authorization: 'Bearer right' } } as never, reply as never);
    expect(reply.status).toBe(0);
  });
});
