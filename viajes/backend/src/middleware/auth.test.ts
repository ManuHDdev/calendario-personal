import { describe, it, expect } from 'vitest';
import { hasAnyRole, type JwtPayload } from './auth';

const WRITE = ['admin', 'viajes_admin'];
const READ = ['admin', 'familia', 'viajes_admin', 'viajes_invitado'];

describe('hasAnyRole', () => {
  it('allows admin and the delegated viajes_admin to write', () => {
    expect(hasAnyRole({ realm_access: { roles: ['admin'] } }, WRITE)).toBe(true);
    expect(hasAnyRole({ realm_access: { roles: ['viajes_admin'] } }, WRITE)).toBe(true);
  });

  it('keeps viajes_invitado and familia read-only', () => {
    for (const role of ['viajes_invitado', 'familia']) {
      const payload: JwtPayload = { realm_access: { roles: [role] } };
      expect(hasAnyRole(payload, READ)).toBe(true);
      expect(hasAnyRole(payload, WRITE)).toBe(false);
    }
  });

  it('rejects the global invitado role and tokens without roles', () => {
    expect(hasAnyRole({ realm_access: { roles: ['invitado'] } }, READ)).toBe(false);
    expect(hasAnyRole({}, READ)).toBe(false);
  });
});
