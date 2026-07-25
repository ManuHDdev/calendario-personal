import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import GastosPage from './pages/GastosPage';

export default function App() {
  return (
    <BrowserRouter basename="/gastos">
      <Routes>
        <Route path="/" element={<GastosPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
