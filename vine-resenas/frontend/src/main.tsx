import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import keycloak from './services/keycloak';
import App from './App';
import { canRead } from './lib/roles';
import './styles/globals.css';
import './styles/app.css';

const root = createRoot(document.getElementById('root')!);

root.render(
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
    <div style={{ width: 24, height: 24, border: '2px solid #e5e5ea', borderTopColor: '#d946ef', borderRadius: '50%', animation: 'spin 700ms linear infinite' }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>,
);

keycloak
  .init({ onLoad: 'login-required', checkLoginIframe: false })
  .then((authenticated) => {
    if (!authenticated) {
      keycloak.login();
      return;
    }

    // Keep the token fresh: media URLs carry it as ?token=.
    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).catch(() => keycloak.login());
    };

    const roles: string[] =
      (keycloak.tokenParsed as { realm_access?: { roles?: string[] } })?.realm_access?.roles ?? [];

    if (!canRead(roles)) {
      root.render(
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', gap: 16, fontFamily: 'system-ui, sans-serif',
        }}>
          <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Acceso denegado</p>
          <p style={{ fontSize: 14, color: '#8e8e93', margin: 0 }}>No tienes permiso para Vine Reseñas.</p>
          <button
            onClick={() => keycloak.logout()}
            style={{ marginTop: 8, padding: '10px 20px', fontSize: 14, background: '#0071e3', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            Cerrar sesión
          </button>
        </div>,
      );
      return;
    }

    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch(() => {
    root.render(
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ color: '#ff3b30' }}>Error al conectar con el servidor de autenticación.</p>
      </div>,
    );
  });
