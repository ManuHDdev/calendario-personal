import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import RutaPage from './pages/RutaPage';

export default function App() {
  return (
    <BrowserRouter basename="/ruta">
      <Routes>
        <Route path="/" element={<RutaPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
