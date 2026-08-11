import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import RequireManager from './components/RequireManager';
import GroupsListPage from './pages/GroupsListPage';
import ManagerGroupPage from './pages/ManagerGroupPage';
import TokenGroupPage from './pages/TokenGroupPage';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter basename="/reparto">
        <Routes>
          {/* Flujo miembro sin cuenta — nunca pasa por Keycloak. */}
          <Route path="/g/:token" element={<TokenGroupPage />} />

          {/* Flujo gestor — requiere login Keycloak. */}
          <Route path="/" element={<RequireManager><GroupsListPage /></RequireManager>} />
          <Route path="/groups/:id" element={<RequireManager><ManagerGroupPage /></RequireManager>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
