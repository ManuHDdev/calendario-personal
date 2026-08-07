import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import keycloak from './services/keycloak';
import App from './App';
import './styles/globals.css';

const root = createRoot(document.getElementById('root')!);

root.render(
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
    <div style={{ width: 24, height: 24, border: '2px solid #e5e5ea', borderTopColor: '#ff453a', borderRadius: '50%', animation: 'spin 700ms linear infinite' }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>,
);

// juegos es la primera subapp abierta a CUALQUIER rol autenticado (admin,
// familia, invitado) — ver design.md "Access guard: any valid role instead
// of a role allowlist". Por eso, a diferencia de gastos/panel/ofertas, aquí
// no hay ninguna comprobación de rol tras el login: basta con tener sesión.
keycloak
  .init({ onLoad: 'login-required', checkLoginIframe: false })
  .then((authenticated) => {
    if (!authenticated) {
      keycloak.login();
      return;
    }

    // Refrescar el token automáticamente cuando queden menos de 60s de validez.
    setInterval(() => {
      keycloak.updateToken(60).catch(() => keycloak.login());
    }, 30_000);

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
