import Keycloak from 'keycloak-js';

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
