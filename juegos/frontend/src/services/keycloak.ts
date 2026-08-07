import Keycloak from 'keycloak-js';

// En local el dev server (Vite :5180) y Keycloak (:8080) son orígenes distintos.
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
