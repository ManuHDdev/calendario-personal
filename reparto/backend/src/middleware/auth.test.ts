import { describe, it, expect } from 'vitest';
import { hasAnyRole, type JwtPayload } from './auth';

describe('hasAnyRole', () => {
  it('allows a user that has one of the allowed roles', () => {
    const payload: JwtPayload = { realm_access: { roles: ['admin', 'familia'] } };
    expect(hasAnyRole(payload, ['admin', 'reparto_admin'])).toBe(true);
  });

  it('allows a delegated reparto_admin', () => {
    const payload: JwtPayload = { realm_access: { roles: ['reparto_admin'] } };
    expect(hasAnyRole(payload, ['admin', 'reparto_admin'])).toBe(true);
  });

  it('allows a read-only reparto_invitado where explicitly permitted', () => {
    const payload: JwtPayload = { realm_access: { roles: ['reparto_invitado'] } };
    expect(hasAnyRole(payload, ['admin', 'reparto_admin', 'reparto_invitado'])).toBe(true);
  });

  it('rejects a user without any of the allowed roles', () => {
    const payload: JwtPayload = { realm_access: { roles: ['familia', 'invitado'] } };
    expect(hasAnyRole(payload, ['admin', 'reparto_admin'])).toBe(false);
  });

  it('rejects a user with no roles at all', () => {
    const payload: JwtPayload = {};
    expect(hasAnyRole(payload, ['admin'])).toBe(false);
  });

  it('rejects reparto_invitado on manager-only routes (create/delete group)', () => {
    expect(hasAnyRole({ realm_access: { roles: ['reparto_invitado'] } }, ['admin', 'reparto_admin'])).toBe(false);
  });
});
