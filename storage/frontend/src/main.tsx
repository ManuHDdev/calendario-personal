import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import keycloak from './services/keycloak';
import './styles/globals.css';

async function init() {
  const root = document.getElementById('root')!;

  try {
    const authenticated = await keycloak.init({
      onLoad: 'login-required',
      checkLoginIframe: false,
      pkceMethod: 'S256',
    });

    if (!authenticated) {
      // keycloak.init redirige automáticamente, pero por si acaso
      keycloak.login();
      return;
    }

    // Verificar rol mínimo: familia o admin
    const roles: string[] = (keycloak.tokenParsed as { realm_access?: { roles?: string[] } })
      ?.realm_access?.roles ?? [];
    if (!roles.includes('admin') && !roles.includes('familia')) {
      root.innerHTML = `
        <div style="
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          background:#f5f5f7;color:#1d1d1f;gap:12px;
        ">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" stroke-width="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <h2 style="margin:0;font-size:20px;font-weight:600">Acceso denegado</h2>
          <p style="margin:0;color:#6e6e73;font-size:14px">No tienes permiso para acceder a esta aplicación.</p>
          <button onclick="window.keycloak && window.keycloak.logout()" style="
            margin-top:8px;padding:10px 20px;background:#1d1d1f;color:#fff;
            border:none;border-radius:8px;font-size:15px;cursor:pointer;
          ">Cerrar sesión</button>
        </div>`;
      return;
    }

    // Refrescar token automáticamente cuando queden menos de 60 s de validez
    setInterval(() => {
      keycloak.updateToken(60).catch(() => {
        keycloak.login();
      });
    }, 30_000);

    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } catch (err) {
    console.error('Keycloak init failed', err);
    root.innerHTML = `
      <div style="
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        background:#f5f5f7;color:#1d1d1f;gap:12px;
      ">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <h2 style="margin:0;font-size:20px;font-weight:600">Error de autenticación</h2>
        <p style="margin:0;color:#6e6e73;font-size:14px">No se pudo conectar con el servidor de autenticación.</p>
        <button onclick="location.reload()" style="
          margin-top:8px;padding:10px 20px;background:#0071e3;color:#fff;
          border:none;border-radius:8px;font-size:15px;cursor:pointer;
        ">Reintentar</button>
      </div>
    `;
  }
}

init();
