import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PisosPage from './pages/PisosPage';

export default function App() {
  return (
    <BrowserRouter basename="/pisos">
      <Routes>
        <Route path="/" element={<PisosPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
