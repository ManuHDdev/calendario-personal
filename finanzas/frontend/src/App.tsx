import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import FinanzasPage from './pages/FinanzasPage';

export default function App() {
  return (
    <BrowserRouter basename="/finanzas">
      <Routes>
        <Route path="/" element={<FinanzasPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
