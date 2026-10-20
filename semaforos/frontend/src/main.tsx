import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import keycloak from './services/keycloak';
import './styles/globals.css';

async function init() {
  const root = document.getElementById('root')!;

  try {
    await keycloak.init({
      onLoad: 'check-sso',
      checkLoginIframe: false,
      pkceMethod: 'S256',
    });

    if (keycloak.authenticated) {
      setInterval(() => {
        keycloak.updateToken(60).catch(() => {
          keycloak.login();
        });
      }, 30_000);
    }

    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } catch (err) {
    console.error('Keycloak init failed', err);
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  }
}

init();
