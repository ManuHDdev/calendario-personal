import { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './pages/AppShell';
import HubPage from './pages/HubPage';
import { SIMULATORS } from './simulators/registry';

export default function App() {
  return (
    <BrowserRouter basename="/simuladores" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HubPage />} />
          {SIMULATORS.map(({ id, path, Component }) => (
            <Route
              key={id}
              path={path}
              element={
                <Suspense fallback={<div className="page-loading" aria-label="Cargando simulador" />}>
                  <Component />
                </Suspense>
              }
            />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
