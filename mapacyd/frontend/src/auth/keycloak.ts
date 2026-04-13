import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: window.location.origin + '/keycloak',
  realm: 'calendario',
  clientId: 'mapacyd-frontend',
});

export default keycloak;
