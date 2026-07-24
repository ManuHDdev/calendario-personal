import { describe, it, expect } from 'vitest';
import { hasAnyRole, JwtPayload } from './auth';

function userWithRoles(roles: string[]): JwtPayload {
  return { realm_access: { roles } };
}

describe('hasAnyRole (role guard used by the download route)', () => {
  it('allows a user with the admin role', () => {
    expect(hasAnyRole(userWithRoles(['admin']), ['admin', 'familia'])).toBe(true);
  });

  it('allows a user with the familia role', () => {
    expect(hasAnyRole(userWithRoles(['familia']), ['admin', 'familia'])).toBe(true);
  });

  it('denies a user with only the invitado role', () => {
    expect(hasAnyRole(userWithRoles(['invitado']), ['admin', 'familia'])).toBe(false);
  });

  it('denies a user with no roles at all', () => {
    expect(hasAnyRole(userWithRoles([]), ['admin', 'familia'])).toBe(false);
  });

  it('denies when the user payload is undefined', () => {
    expect(hasAnyRole(undefined, ['admin', 'familia'])).toBe(false);
  });
});
