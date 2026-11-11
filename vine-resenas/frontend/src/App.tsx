import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DetailPage from './pages/DetailPage';
import ListPage from './pages/ListPage';
import { canWrite } from './lib/roles';
import keycloak from './services/keycloak';

export default function App() {
  const roles: string[] =
    (keycloak.tokenParsed as { realm_access?: { roles?: string[] } })?.realm_access?.roles ?? [];
  const write = canWrite(roles);
  return (
    <BrowserRouter basename="/vine-resenas">
      <Routes>
        <Route path="/" element={<ListPage />} />
        <Route path="/publicados" element={<ListPage archive />} />
        <Route path="/p/:asin" element={<DetailPage canWrite={write} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
