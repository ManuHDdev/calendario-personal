import Keycloak from 'keycloak-js';

// Locally the Vite dev server (:5191) and Keycloak (:8080) are different origins.
// In production Keycloak lives under /keycloak on the same domain.
const keycloakUrl =
  window.location.hostname === 'localhost'
    ? 'http://localhost:8080'
    : window.location.origin + '/keycloak';

const keycloak = new Keycloak({
  url: keycloakUrl,
  realm: 'calendario',
  clientId: 'calendario-frontend',
});

export default keycloak;

// Must mirror the backend (backend/src/routes/context.ts).
export const WRITE_ROLES = ['admin', 'viajes_admin'];
export const READ_ROLES = ['admin', 'familia', 'viajes_admin', 'viajes_invitado'];

export function getKeycloakRoles(): string[] {
  return (
    (keycloak.tokenParsed as { realm_access?: { roles?: string[] } })?.realm_access?.roles ?? []
  );
}

export function canWrite(): boolean {
  const roles = getKeycloakRoles();
  return WRITE_ROLES.some((r) => roles.includes(r));
}

export function canRead(): boolean {
  const roles = getKeycloakRoles();
  return READ_ROLES.some((r) => roles.includes(r));
}
