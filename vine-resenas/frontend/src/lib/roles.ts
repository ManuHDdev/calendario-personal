// Mirrors the backend: read = admin|vine_admin|vine_invitado, write = admin|vine_admin.
const READ_ROLES = ['admin', 'vine_admin', 'vine_invitado'];
const WRITE_ROLES = ['admin', 'vine_admin'];

export function canRead(roles: string[]): boolean {
  return READ_ROLES.some((r) => roles.includes(r));
}

export function canWrite(roles: string[]): boolean {
  return WRITE_ROLES.some((r) => roles.includes(r));
}
