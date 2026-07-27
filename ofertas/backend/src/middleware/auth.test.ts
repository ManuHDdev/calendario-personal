import { describe, it, expect } from 'vitest';
import { hasAnyRole, type JwtPayload } from './auth';

describe('hasAnyRole', () => {
  it('allows a user that has one of the allowed roles', () => {
    const payload: JwtPayload = { realm_access: { roles: ['admin', 'familia'] } };
    expect(hasAnyRole(payload, ['admin'])).toBe(true);
  });

  it('rejects a user without any of the allowed roles', () => {
    const payload: JwtPayload = { realm_access: { roles: ['familia', 'invitado'] } };
    expect(hasAnyRole(payload, ['admin'])).toBe(false);
  });

  it('rejects a user with no roles at all', () => {
    const payload: JwtPayload = {};
    expect(hasAnyRole(payload, ['admin'])).toBe(false);
  });

  it('rejects familia and invitado explicitly (ofertas is admin-only)', () => {
    expect(hasAnyRole({ realm_access: { roles: ['familia'] } }, ['admin'])).toBe(false);
    expect(hasAnyRole({ realm_access: { roles: ['invitado'] } }, ['admin'])).toBe(false);
  });
});
