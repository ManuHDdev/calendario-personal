import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import keycloak from './services/keycloak';
import App from './App';
import './styles/globals.css';

const root = createRoot(document.getElementById('root')!);

root.render(
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
    <div style={{ width: 24, height: 24, border: '2px solid #e5e5ea', borderTopColor: '#bf5af2', borderRadius: '50%', animation: 'spin 700ms linear infinite' }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>,
);

// ofertas es de acceso exclusivo del propietario (rol admin) — mismo patrón
// que panel/frontend y gastos/frontend: login-required + comprobación de rol
// antes de montar la app.
keycloak
  .init({ onLoad: 'login-required', checkLoginIframe: false })
  .then((authenticated) => {
    if (!authenticated) {
      keycloak.login();
      return;
    }

    const roles: string[] =
      (keycloak.tokenParsed as { realm_access?: { roles?: string[] } })?.realm_access?.roles ?? [];

    if (!roles.includes('admin')) {
      root.render(
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', gap: 16, fontFamily: 'system-ui, sans-serif',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#1c1c1e', margin: 0 }}>Acceso denegado</p>
          <p style={{ fontSize: 14, color: '#8e8e93', margin: 0 }}>Necesitas el rol de administrador.</p>
          <button
            onClick={() => keycloak.logout()}
            style={{ marginTop: 8, padding: '8px 20px', fontSize: 14, background: '#0071e3', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
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
