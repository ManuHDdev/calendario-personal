import Keycloak from 'keycloak-js';

// En local el dev server (Vite :5182) y Keycloak (:8080) son orígenes distintos.
// En producción Keycloak está bajo /keycloak en el mismo dominio.
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

export function getKeycloakRoles(): string[] {
  return (
    (keycloak.tokenParsed as { realm_access?: { roles?: string[] } })?.realm_access?.roles ?? []
  );
}

export const MANAGER_ROLES = ['admin', 'reparto_admin'];
export const READ_ROLES = ['admin', 'reparto_admin', 'reparto_invitado'];

export function isManager(): boolean {
  const roles = getKeycloakRoles();
  return MANAGER_ROLES.some((r) => roles.includes(r));
}

export function hasAnyRepartoRole(): boolean {
  const roles = getKeycloakRoles();
  return READ_ROLES.some((r) => roles.includes(r));
}
