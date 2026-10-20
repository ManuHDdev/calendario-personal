import React from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import App from './App';
import keycloak from './services/keycloak';
import './styles/globals.css';
import './styles/layout.css';

// Viajes is private: every route needs a Keycloak session, so the login is
// required up front (same approach as gastos) and role gating happens in App.
async function init() {
  const root = document.getElementById('root')!;
  try {
    await keycloak.init({
      onLoad: 'login-required',
      checkLoginIframe: false,
      pkceMethod: 'S256',
    });

    setInterval(() => {
      keycloak.updateToken(60).catch(() => keycloak.login());
    }, 30_000);

    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } catch (err) {
    console.error('Keycloak init failed', err);
    root.innerHTML =
      '<div class="fullscreen-status"><p class="fullscreen-status-title">No se pudo iniciar sesión</p>' +
      '<p class="fullscreen-status-hint">Comprueba que el servicio de autenticación está disponible e inténtalo de nuevo.</p></div>';
  }
}

void init();
