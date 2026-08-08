import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import keycloak from './services/keycloak';
import App from './App';
import './styles/globals.css';

const root = createRoot(document.getElementById('root')!);

root.render(
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
    <div style={{ width: 24, height: 24, border: '2px solid #e5e5ea', borderTopColor: '#0071e3', borderRadius: '50%', animation: 'spin 700ms linear infinite' }} />
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

    const roles: string[] =
      (keycloak.tokenParsed as { realm_access?: { roles?: string[] } })?.realm_access?.roles ?? [];
    const isAdmin = roles.includes('admin');

    root.render(
      <StrictMode>
        <App isAdmin={isAdmin} />
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
