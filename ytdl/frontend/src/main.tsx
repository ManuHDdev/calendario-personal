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

    // Herramienta pública: no se exige login ni rol alguno. Si el visitante
    // ya tiene sesión SSO activa (Calendario/Storage/etc en el mismo
    // navegador), keycloak.authenticated vendrá a true y se podrá mostrar
    // el menú de apps; en caso contrario la página funciona igual.
    if (keycloak.authenticated) {
      // Refrescar token automáticamente cuando queden menos de 60 s de validez
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
    // Ytdl es una herramienta pública: si Keycloak no está disponible no
    // debe bloquear la página, solo degradar (el menú de apps no se mostrará
    // porque keycloak.authenticated quedará en falso).
    console.error('Keycloak init failed', err);
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  }
}

init();
