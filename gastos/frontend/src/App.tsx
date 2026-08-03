import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import GastosPage from './pages/GastosPage';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter basename="/gastos">
        <Routes>
          <Route path="/" element={<GastosPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
